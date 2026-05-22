import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  cancelTrainingPlanJob,
  getLatestTrainingPlanJob,
  getLatestTrainingPlanReport,
  getTrainingPlanJob,
  retryTrainingPlanJob,
  startTrainingPlanJob,
  type AnalysisJob,
  type AnalysisJobStage,
  type ReviewMoment,
  type TrainingPlanReport,
} from '../../api/accountAnalysis'
import { cleanPgn } from '../../chess/pgn'
import { getAnalyzedGame, type AnalyzedGameRecord } from '../../services/gameDB'
import { useAuthStore } from '../../stores/authStore'
import { useGameStore } from '../../stores/gameStore'
import { buildSupportIssueUrl } from '../../config/contact'
import { trackLaunchEvent } from '../../services/launchAnalytics'

interface AccountAnalysisPageProps {
  onOpenReview?: (mode?: 'lesson') => void
  onOpenProfile?: () => void
}

const STAGE_COPY: Record<AnalysisJobStage, string> = {
  queued: 'Queued',
  fetching_games: 'Fetching games',
  scanning_metadata: 'Scanning the year',
  analyzing_candidates: 'Checking candidate moments',
  deep_reviewing_examples: 'Selecting review examples',
  saving_report: 'Saving report',
  complete: 'Snapshot ready',
  failed: 'Needs attention',
  cancelled: 'Cancelled',
}

function formatReportDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function formatResult(result: ReviewMoment['result']): string {
  if (result === 'W') return 'Win'
  if (result === 'L') return 'Loss'
  if (result === 'D') return 'Draw'
  return 'Game'
}

function reportHasSignal(report: TrainingPlanReport | null): boolean {
  return !!report && (report.scan_summary.eligible_games ?? 0) > 0
}

function buildMomentGameId(moment: ReviewMoment): string {
  return moment.platform_game_id ?? `backend:${moment.game_id}`
}

function buildMomentPlyBefore(target: ReviewMoment): number {
  return Math.max(0, (target.move_number - 1) * 2 + (target.color === 'white' ? 0 : 1))
}

function hasTrustedBetterMove(moment: ReviewMoment): boolean {
  return moment.verified === true && moment.verification_method === 'engine'
}

function safeCoachNote(moment: ReviewMoment): string {
  if (hasTrustedBetterMove(moment)) return moment.coach_note
  return 'Matched a broad-scan review pattern. DeepMove still needs engine verification before naming this as a lesson example.'
}

function exampleStatusCopy(moment: ReviewMoment): string {
  if (hasTrustedBetterMove(moment)) return `Better idea to find: ${moment.better_move_san}`
  return 'Needs engine verification before this can be used as lesson evidence.'
}

function hydrateStoreFromRecord(record: AnalyzedGameRecord, target: ReviewMoment): void {
  const store = useGameStore.getState()
  const gameId = record.id
  const plyIndex = buildMomentPlyBefore(target)
  store.reset()
  store.setCurrentGameId(gameId)
  store.setCurrentGameMeta({
    opponent: record.opponent,
    opponentRating: record.opponentRating,
    result: record.result,
    timeControl: record.timeControl,
    endTime: record.endTime,
  })
  store.setUserColor(record.userColor)
  if (record.userElo && record.userElo > 0) store.setUserElo(record.userElo)
  store.setPlatform(record.platform === 'chesscom' || record.platform === 'lichess' ? record.platform : null)
  store.setBackendGameId(record.backendGameId ?? null)
  store.setRawPgn(record.rawPgn)
  store.setLoadedPgn(record.rawPgn)
  store.setPgn(record.cleanedPgn || cleanPgn(record.rawPgn))
  store.setMoveEvals(record.moveEvals)
  store.setCriticalMoments(record.criticalMoments)
  store.setResumeFromIndex(record.partial ? record.moveEvals.length : 0)
  store.setSkipNextAnalysis(!record.partial)
  store.setPendingReviewTarget({
    gameId,
    plyIndex,
    moveNumber: target.move_number,
    color: target.color,
  })
  store.bumpLoadRequestId()
}

function hydrateStoreFromMoment(moment: ReviewMoment): void {
  const store = useGameStore.getState()
  const gameId = buildMomentGameId(moment)
  const plyIndex = buildMomentPlyBefore(moment)
  store.reset()
  store.setCurrentGameId(gameId)
  store.setCurrentGameMeta({
    opponent: moment.opponent ?? 'Opponent',
    opponentRating: 0,
    result: moment.result === 'W' || moment.result === 'L' || moment.result === 'D' ? moment.result : 'D',
    timeControl: moment.time_control ?? '',
    endTime: Date.now(),
  })
  store.setUserColor(moment.color)
  store.setPlatform(moment.platform === 'chesscom' || moment.platform === 'lichess' ? moment.platform : null)
  store.setBackendGameId(moment.game_id)
  store.setRawPgn(moment.pgn)
  store.setLoadedPgn(moment.pgn)
  store.setPgn(cleanPgn(moment.pgn))
  store.setMoveEvals([])
  store.setCriticalMoments([])
  store.setResumeFromIndex(0)
  store.setSkipNextAnalysis(false)
  store.setPendingReviewTarget({
    gameId,
    plyIndex,
    moveNumber: moment.move_number,
    color: moment.color,
  })
  store.bumpLoadRequestId()
}

function setLessonReviewContext(
  report: TrainingPlanReport,
  moment: ReviewMoment,
  index: number,
  examples: ReviewMoment[],
): void {
  const lesson = report.lesson_context ?? {}
  const title = lesson.report_title ?? lesson.title ?? report.current_focus.title
  const summary = lesson.summary ?? report.current_focus.summary
  const habit = lesson.habit?.length ? lesson.habit : report.current_focus.habit
  useGameStore.getState().setLessonReviewContext({
    source: 'insights',
    lessonId: lesson.id ?? moment.lesson_id ?? report.current_focus.category,
    lessonTitle: title,
    lessonSummary: summary,
    habit,
    exampleIndex: index,
    exampleCount: examples.length,
    movePlayed: moment.played_san ?? moment.move_played,
    betterMoveSan: hasTrustedBetterMove(moment) ? moment.better_move_san ?? null : null,
    betterMoveUci: hasTrustedBetterMove(moment) ? moment.better_move_uci ?? null : null,
    coachNote: safeCoachNote(moment),
    practicePrompt: moment.practice_prompt ?? lesson.practice_prompt ?? '',
    themeFacts: hasTrustedBetterMove(moment) ? moment.theme_facts ?? [] : [],
  })
}

export default function AccountAnalysisPage({ onOpenReview, onOpenProfile }: AccountAnalysisPageProps) {
  const user = useAuthStore(s => s.user)
  const accessToken = useAuthStore(s => s.accessToken)
  const [job, setJob] = useState<AnalysisJob | null>(null)
  const [report, setReport] = useState<TrainingPlanReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasLinkedAccount = !!user?.chesscom_username || !!user?.lichess_username
  const jobActive = job?.status === 'queued' || job?.status === 'running'

  const loadStatus = useCallback(async () => {
    if (!accessToken) return
    setError(null)
    const [latestJob, latestReport] = await Promise.all([
      getLatestTrainingPlanJob(),
      getLatestTrainingPlanReport(),
    ])
    setJob(latestJob)
    setReport(latestReport)
  }, [accessToken])

  useEffect(() => {
    void loadStatus().catch(err => {
      setError(err instanceof Error ? err.message : 'Could not load your beta report.')
    })
  }, [loadStatus])

  useEffect(() => {
    if (!jobActive || !job) return
    const handle = window.setInterval(() => {
      void getTrainingPlanJob(job.id)
        .then(response => {
          setJob(response.job)
          if (response.report) setReport(response.report)
        })
        .catch(err => {
          setError(err instanceof Error ? err.message : 'Could not refresh analysis progress.')
        })
    }, 2500)
    return () => window.clearInterval(handle)
  }, [job, jobActive])

  useEffect(() => {
    void trackLaunchEvent(
      'training_plan_beta_opened',
      { has_report: reportHasSignal(report) },
      { oncePerSessionKey: 'training_plan_beta_opened' },
    )
  }, [report])

  const startReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await startTrainingPlanJob()
      setJob(response.job)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start your beta report scan.')
    } finally {
      setLoading(false)
    }
  }, [])

  const retryReport = useCallback(async () => {
    if (!job) return
    setLoading(true)
    setError(null)
    try {
      setJob(await retryTrainingPlanJob(job.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not retry this scan.')
    } finally {
      setLoading(false)
    }
  }, [job])

  const cancelReport = useCallback(async () => {
    if (!job) return
    setError(null)
    try {
      setJob(await cancelTrainingPlanJob(job.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel this scan.')
    }
  }, [job])

  const allExamples = useMemo(
    () => report?.verified_examples?.length ? report.verified_examples : report?.review_moments ?? [],
    [report],
  )
  const examples = useMemo(
    () => allExamples.filter(hasTrustedBetterMove),
    [allExamples],
  )
  const visibleMoments = examples.length > 0 ? examples : allExamples
  const reviewPromptsNeedingCheck = allExamples.length - examples.length
  const openMoment = useCallback(async (moment: ReviewMoment, index = 0) => {
    const cached = await getAnalyzedGame(buildMomentGameId(moment))
    if (cached) hydrateStoreFromRecord(cached, moment)
    else hydrateStoreFromMoment(moment)
    const contextMoments = hasTrustedBetterMove(moment) ? examples : allExamples
    const contextIndex = Math.max(0, contextMoments.findIndex(item => item.example_id === moment.example_id))
    if (report) setLessonReviewContext(report, moment, contextIndex >= 0 ? contextIndex : index, contextMoments)
    onOpenReview?.('lesson')
  }, [allExamples, examples, onOpenReview, report])

  const primaryMoment = visibleMoments[0] ?? null
  const stageLabel = job ? STAGE_COPY[job.stage] : 'Ready'
  const reportReady = reportHasSignal(report)
  const hasVerifiedLesson = examples.length > 0
  const hasProvisionalFocus = !hasVerifiedLesson && visibleMoments.length > 0

  const focusSummary = useMemo(() => {
    if (!report) return null
    const count = report.scan_summary.eligible_games ?? 0
    return `${count} eligible game${count === 1 ? '' : 's'} scanned across the last 12 months.`
  }, [report])
  const displayLessonTitle = hasVerifiedLesson
    ? report?.lesson_context?.report_title ?? report?.current_focus.title ?? 'Your lesson'
    : hasProvisionalFocus
      ? `Provisional focus: ${report?.lesson_context?.report_title ?? report?.current_focus.title ?? 'Review candidate moments'}`
      : 'No clear focus yet.'
  const displayLessonSummary = hasVerifiedLesson
    ? report?.lesson_context?.summary ?? report?.current_focus.summary ?? ''
    : hasProvisionalFocus
      ? 'The broad scan found a repeated pattern. These positions are review prompts, not verified lesson evidence yet.'
      : 'DeepMove did not find enough clean evidence to choose a focus from this scan.'
  const displayLessonHabit = hasVerifiedLesson
    ? report?.lesson_context?.habit ?? report?.current_focus.habit ?? []
    : hasProvisionalFocus
      ? report?.lesson_context?.habit ?? report?.current_focus.habit ?? ['Open a prompt.', 'Check it with the engine.', 'Keep only examples where the better idea clearly matters.']
      : ['Review one recent loss.', 'Run Insights again after more games.']
  const feedbackUrl = useMemo(
    () => buildSupportIssueUrl({ page: 'insights-beta', section: 'account-snapshot' }),
    [],
  )

  if (!accessToken) {
    return (
      <div className="account-analysis-page">
        <section className="account-analysis-hero">
          <div>
            <p className="account-analysis-kicker">Insights Beta</p>
            <h1>Analyze account history.</h1>
            <p>Sign in and connect an account so DeepMove can store a beta snapshot from your recent games and improve it as stronger examples are verified.</p>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="account-analysis-page">
      <section className="account-analysis-hero">
        <div>
          <p className="account-analysis-kicker">Insights Beta</p>
          <h1>{reportReady ? 'Your beta training snapshot is ready.' : 'Analyze account history.'}</h1>
          <p>
            DeepMove scans up to 500 blitz-and-longer games from the last year, looks for lesson
            patterns, then only promotes examples after they have stronger review evidence.
          </p>
          <p className="account-analysis-controls__note">
            Beta lesson snapshot: strongest with 50+ eligible games.
          </p>
        </div>
        <div className="account-analysis-controls" aria-label="Insights Beta controls">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void startReport()}
            disabled={loading || jobActive || !hasLinkedAccount}
          >
            {loading ? 'Starting...' : reportReady ? 'Save new snapshot' : 'Build beta report'}
          </button>
          {jobActive && (
            <button type="button" className="btn btn-secondary" onClick={() => void cancelReport()}>
              Cancel
            </button>
          )}
          {!hasLinkedAccount && (
            <>
              <p className="account-analysis-controls__note">Connect Chess.com or Lichess before building a beta report.</p>
              {onOpenProfile && <button type="button" className="btn btn-secondary" onClick={onOpenProfile}>Open profile</button>}
            </>
          )}
          <a className="btn btn-secondary" href={feedbackUrl} target="_blank" rel="noreferrer">
            Share beta feedback
          </a>
        </div>
      </section>

      {error && <div className="account-analysis-error" role="alert">{error}</div>}

      {job && job.status !== 'complete' && (
        <section className={`account-analysis-coverage account-analysis-coverage--${job.status === 'failed' ? 'low' : 'medium'}`}>
          <div>
            <span>{stageLabel}</span>
            <strong>{job.progress_pct}% complete</strong>
            <p>
                Backend analysis can continue after this page closes. The worker fetches games, looks
                for lesson patterns, and saves a snapshot when it finishes.
            </p>
            <div className="account-analysis-meter" aria-hidden="true">
              <div style={{ width: `${job.progress_pct}%` }} />
            </div>
            {job.error && <p className="account-analysis-queue__error">{job.error}</p>}
          </div>
          {(job.status === 'failed' || job.status === 'cancelled') && (
            <div className="account-analysis-queue-actions">
              <button type="button" className="btn btn-primary" onClick={() => void retryReport()} disabled={loading}>
                Retry scan
              </button>
            </div>
          )}
        </section>
      )}

      {reportReady && report && (
        <>
          <section className="account-analysis-coverage account-analysis-coverage--high">
            <div>
              <span>Snapshot ready</span>
              <strong>{displayLessonTitle}</strong>
              <p>{focusSummary} Saved {formatReportDate(report.created_at)}.</p>
            </div>
            {primaryMoment && (
              <div className="account-analysis-queue-actions">
                <button type="button" className="btn btn-primary" onClick={() => void openMoment(primaryMoment, 0)}>
                  {hasVerifiedLesson ? 'Study this lesson' : 'Open strongest prompt'}
                </button>
              </div>
            )}
          </section>

          <section className="account-coach-brief account-coach-brief--weakness">
            <div className="account-coach-brief__header">
              <div>
                <span>{hasVerifiedLesson ? 'Your lesson' : hasProvisionalFocus ? 'Provisional focus' : 'Verification needed'}</span>
                <h3>{displayLessonTitle}</h3>
              </div>
              <em>
                {hasVerifiedLesson
                  ? `${examples.length} verified example${examples.length === 1 ? '' : 's'}`
                  : hasProvisionalFocus
                    ? `${visibleMoments.length} prompt${visibleMoments.length === 1 ? '' : 's'}`
                    : 'Needs engine check'}
              </em>
            </div>
            <div className="account-coach-brief__grid">
              <div>
                <span>Why</span>
                <p>{displayLessonSummary}</p>
              </div>
              <div>
                <span>What to do now</span>
                <p>{displayLessonHabit.join(' ')}</p>
              </div>
            </div>

            {visibleMoments.length > 0 ? (
              <div className="account-evidence-moments">
                <div className="account-evidence-moments__title">
                  <strong>{hasVerifiedLesson ? 'Examples from your games' : 'Review prompts from your games'}</strong>
                  <span>
                    {hasVerifiedLesson
                      ? 'Only engine-verified examples are shown here.'
                      : 'Open these as candidate positions; do not treat them as proof until the engine confirms the idea matters.'}
                  </span>
                </div>
                {visibleMoments.map((moment, index) => (
                  <div className="account-evidence-row" key={`${moment.game_id}:${moment.move_number}:${moment.color}`}>
                    <div>
                      <strong>{`Example ${index + 1}: ${moment.title}`}</strong>
                      <span>
                        {formatResult(moment.result)} vs {moment.opponent ?? 'opponent'} - {moment.segment} - {safeCoachNote(moment)}
                      </span>
                      <small>{exampleStatusCopy(moment)}</small>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={() => void openMoment(moment, index)}>
                      {hasTrustedBetterMove(moment) ? 'Study example' : 'Open prompt'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="account-analysis-empty-copy">
                {reviewPromptsNeedingCheck > 0
                  ? `${reviewPromptsNeedingCheck} review prompt${reviewPromptsNeedingCheck === 1 ? '' : 's'} matched the broad scan, but none have engine-verified lesson evidence yet.`
                  : `DeepMove needs about ${report.scan_summary.minimum_lesson_games ?? 50} eligible games before it can trust an account-wide lesson.`}
              </div>
            )}
          </section>

          <details className="account-analysis-card account-pattern-evidence">
            <summary>
              <span>Other patterns noticed</span>
              <em>{report.top_trends.length} tracked pattern{report.top_trends.length === 1 ? '' : 's'}</em>
            </summary>
            <div className="account-weakness-list">
              {report.top_trends.map(trend => (
                <div className="account-weakness-row" key={trend.category}>
                  <div>
                    <strong>{trend.label}</strong>
                    <span>{hasVerifiedLesson && trend.confidence === 'verified_examples' ? 'Backed by lesson examples' : 'Secondary pattern'}</span>
                  </div>
                  <em>{trend.count} signals</em>
                </div>
              ))}
            </div>
          </details>

          <details className="account-analysis-card account-pattern-evidence">
            <summary>
              <span>Opening context</span>
              <em>{report.opening_context.length} opening group{report.opening_context.length === 1 ? '' : 's'}</em>
            </summary>
            <OpeningContextRows openings={report.opening_context} />
          </details>
        </>
      )}
    </div>
  )
}

function OpeningContextRows({ openings }: { openings: TrainingPlanReport['opening_context'] }) {
  const white = openings.filter(opening => opening.color !== 'black')
  const black = openings.filter(opening => opening.color === 'black')
  return (
    <div className="account-opening-groups">
      {([
        ['White', white],
        ['Black', black],
      ] as const).map(([label, rows]) => (
        <div className="account-opening-group" key={label}>
          <strong>{label}</strong>
          <div className="account-opening-list">
            {rows.length === 0 ? (
              <span className="account-opening-empty">No repeated {label.toLowerCase()} openings in this scan.</span>
            ) : rows.map(opening => (
              <div className="account-opening-row" key={`${opening.color ?? label}:${opening.opening}`}>
                <div>
                  <strong>{opening.opening}</strong>
                  <span>{opening.games} game{opening.games === 1 ? '' : 's'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
