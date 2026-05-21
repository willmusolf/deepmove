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

interface AccountAnalysisPageProps {
  onOpenReview?: () => void
  onOpenProfile?: () => void
}

const STAGE_COPY: Record<AnalysisJobStage, string> = {
  queued: 'Queued',
  fetching_games: 'Fetching games',
  scanning_metadata: 'Scanning the year',
  analyzing_candidates: 'Checking candidate moments',
  deep_reviewing_examples: 'Selecting review examples',
  saving_report: 'Saving report',
  complete: 'Training Plan ready',
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

function hydrateStoreFromRecord(record: AnalyzedGameRecord, target: ReviewMoment): void {
  const store = useGameStore.getState()
  const gameId = record.id
  const plyIndex = (target.move_number - 1) * 2 + (target.color === 'white' ? 1 : 2)
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
  const plyIndex = (moment.move_number - 1) * 2 + (moment.color === 'white' ? 1 : 2)
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
      setError(err instanceof Error ? err.message : 'Could not load your Training Plan.')
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

  const startReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await startTrainingPlanJob()
      setJob(response.job)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start your Training Plan scan.')
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

  const openMoment = useCallback(async (moment: ReviewMoment) => {
    const cached = await getAnalyzedGame(buildMomentGameId(moment))
    if (cached) hydrateStoreFromRecord(cached, moment)
    else hydrateStoreFromMoment(moment)
    onOpenReview?.()
  }, [onOpenReview])

  const primaryMoment = report?.review_moments[0] ?? null
  const stageLabel = job ? STAGE_COPY[job.stage] : 'Ready'
  const reportReady = reportHasSignal(report)

  const focusSummary = useMemo(() => {
    if (!report) return null
    const count = report.scan_summary.eligible_games ?? 0
    return `${count} eligible game${count === 1 ? '' : 's'} scanned across the last 12 months.`
  }, [report])

  if (!accessToken) {
    return (
      <div className="account-analysis-page">
        <section className="account-analysis-hero">
          <div>
            <p className="account-analysis-kicker">Training Plan</p>
            <h1>Create your chess baseline.</h1>
            <p>Sign in and connect an account so DeepMove can scan your recent games and build a saved Training Plan.</p>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="account-analysis-page">
      <section className="account-analysis-hero">
        <div>
          <p className="account-analysis-kicker">Training Plan</p>
          <h1>{reportReady ? 'Your Training Plan is ready.' : 'Create your first Training Plan.'}</h1>
          <p>
            DeepMove scans up to 500 blitz-and-longer games from the last year, finds recurring trends,
            then picks review moments from your own games.
          </p>
        </div>
        <div className="account-analysis-controls" aria-label="Training Plan controls">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void startReport()}
            disabled={loading || jobActive || !hasLinkedAccount}
          >
            {loading ? 'Starting...' : reportReady ? 'Create new report' : 'Create your Training Plan'}
          </button>
          {jobActive && (
            <button type="button" className="btn btn-secondary" onClick={() => void cancelReport()}>
              Cancel
            </button>
          )}
          {!hasLinkedAccount && (
            <>
              <p className="account-analysis-controls__note">Connect Chess.com or Lichess before creating a Training Plan.</p>
              {onOpenProfile && <button type="button" className="btn btn-secondary" onClick={onOpenProfile}>Open profile</button>}
            </>
          )}
        </div>
      </section>

      {error && <div className="account-analysis-error" role="alert">{error}</div>}

      {job && job.status !== 'complete' && (
        <section className={`account-analysis-coverage account-analysis-coverage--${job.status === 'failed' ? 'low' : 'medium'}`}>
          <div>
            <span>{stageLabel}</span>
            <strong>{job.progress_pct}% complete</strong>
            <p>
              Backend analysis can continue after this page closes. The worker fetches games, scans candidate
              moments, and saves a report snapshot when it finishes.
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
              <span>Training Plan ready</span>
              <strong>{report.current_focus.title}</strong>
              <p>{focusSummary} Saved {formatReportDate(report.created_at)}.</p>
            </div>
            {primaryMoment && (
              <div className="account-analysis-queue-actions">
                <button type="button" className="btn btn-primary" onClick={() => void openMoment(primaryMoment)}>
                  Start 10-minute review
                </button>
              </div>
            )}
          </section>

          <section className="account-coach-brief account-coach-brief--weakness">
            <div className="account-coach-brief__header">
              <div>
                <span>{report.current_focus.confidence === 'verified_examples' ? 'Verified examples' : 'Trend signal'}</span>
                <h3>{report.current_focus.title}</h3>
              </div>
              <em>Current focus</em>
            </div>
            <div className="account-coach-brief__grid">
              <div>
                <span>Why</span>
                <p>{report.current_focus.summary}</p>
              </div>
              <div>
                <span>This week</span>
                <p>{report.current_focus.habit.join(' ')}</p>
              </div>
            </div>

            {report.review_moments.length > 0 && (
              <div className="account-evidence-moments">
                <div className="account-evidence-moments__title">
                  <strong>Review these moments</strong>
                  <span>Each one opens your game at the move DeepMove selected.</span>
                </div>
                {report.review_moments.map(moment => (
                  <div className="account-evidence-row" key={`${moment.game_id}:${moment.move_number}:${moment.color}`}>
                    <div>
                      <strong>{moment.title}</strong>
                      <span>
                        {formatResult(moment.result)} vs {moment.opponent ?? 'opponent'} - {moment.segment} - {moment.coach_note}
                      </span>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={() => void openMoment(moment)}>
                      Review this moment
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <details className="account-analysis-card account-pattern-evidence">
            <summary>
              <span>Trend context</span>
              <em>{report.top_trends.length} trend signal{report.top_trends.length === 1 ? '' : 's'}</em>
            </summary>
            <div className="account-weakness-list">
              {report.top_trends.map(trend => (
                <div className="account-weakness-row" key={trend.category}>
                  <div>
                    <strong>{trend.label}</strong>
                    <span>{trend.confidence === 'verified_examples' ? 'Backed by selected review examples' : 'Broad scan signal'}</span>
                  </div>
                  <em>{trend.count}</em>
                </div>
              ))}
            </div>
          </details>

          <details className="account-analysis-card account-pattern-evidence">
            <summary>
              <span>Opening context</span>
              <em>{report.opening_context.length} opening group{report.opening_context.length === 1 ? '' : 's'}</em>
            </summary>
            <div className="account-opening-list">
              {report.opening_context.map(opening => (
                <div className="account-opening-row" key={opening.opening}>
                  <div>
                    <strong>{opening.opening}</strong>
                    <span>{opening.games} game{opening.games === 1 ? '' : 's'}</span>
                  </div>
                </div>
              ))}
            </div>
          </details>

          <details className="account-analysis-card account-pattern-evidence">
            <summary>
              <span>Technical evidence</span>
              <em>{report.scan_summary.candidate_positions ?? 0} candidate positions</em>
            </summary>
            <p className="account-analysis-empty-copy">
              {report.scan_summary.engine_note ?? 'Broad scan evidence is saved with this report snapshot.'}
            </p>
            <div className="account-weakness-list">
              {report.time_control_breakdown.map(segment => (
                <div className="account-weakness-row" key={segment.segment}>
                  <div>
                    <strong>{segment.segment}</strong>
                    <span>Included in this report</span>
                  </div>
                  <em>{segment.games}</em>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  )
}
