// useCoaching.ts — Coaching pipeline hook
// Orchestrates: feature extraction → analysis facts → LLM lesson fetch → checklist reminder

import { useState, useEffect, useRef } from 'react'
import type { AnalysisFacts, CriticalMoment, MistakeType } from '../chess/types'
import type { MoveEval } from '../engine/analysis'
import { enrichCriticalMoments } from '../chess/features'
import { getCacheBand, classifyTimeControl } from '../chess/eloConfig'
import { CATEGORIES } from '../chess/taxonomy'
import { ApiError, api } from '../api/client'

export interface LessonResponse {
  lesson: string
  category: string | null
  confidence: number
  cached: boolean
}

export interface CoachingLesson {
  moment: CriticalMoment
  lessonText: string | null
  category: string | null
  categoryName: string | null
  confidence: number
  isLoading: boolean
  error: string | null
  requiresChecklistFirst: boolean
  checklistRevealed: boolean
}

const CHECKLIST_CATEGORIES = new Set(['hung_piece', 'ignored_threat'])

function buildFallbackAnalysisFacts(moment: CriticalMoment): AnalysisFacts {
  const category = 'unknown'
  const categoryName = CATEGORIES[category].name
  const mistakeType: MistakeType = (moment.engineBest[0]?.includes('x') || moment.engineBest[0]?.includes('+'))
    ? 'tactical'
    : 'strategic'
  const primaryIssue = `Mistake type: ${mistakeType}. This moment needs fallback coaching facts because cached analysis is from an older format.`
  const moveEffect = `What your move did: move ${moment.moveNumber}, ${moment.movePlayed}. The position swung by ${moment.evalSwing} centipawns.`
  const missedResponsibility = `What your move failed to do: it missed a better continuation in the position.`
  const betterIdea = moment.engineBest[0]
    ? `What the better move would have done: ${moment.engineBest[0]} was the stronger practical idea in this position.`
    : 'What the better move would have done: improved the position with a more purposeful idea.'
  const consequence = `What happened next: after this move, your evaluation was ${moment.evalAfter >= 0 ? '+' : ''}${moment.evalAfter}cp.`

  return {
    category,
    categoryName,
    mistakeType,
    primaryIssue,
    moveEffect,
    missedResponsibility,
    betterIdea,
    consequence,
    factList: [primaryIssue, moveEffect, missedResponsibility, betterIdea, consequence],
  }
}

interface UseCoachingOptions {
  criticalMoments: CriticalMoment[]
  moveEvals: MoveEval[]
  pgn: string
  userElo: number
  /** Time control in seconds (e.g. "600"). Defaults to "600". */
  timeControl?: string
  /** Backend DB primary key — preferred over platformGameId for cache lookup. */
  backendGameId?: number | null
  /** Platform-specific game ID (e.g. Chess.com game ID). Used for DB lesson cache. */
  platformGameId?: string
  /** Game platform ("chesscom" | "lichess" | "pgn-paste"). Used for DB lesson cache. */
  platform?: string
}

export function useCoaching({
  criticalMoments,
  moveEvals,
  pgn,
  userElo,
  timeControl = '600',
  backendGameId,
  platformGameId,
  platform,
}: UseCoachingOptions) {
  const [lessons, setLessons] = useState<CoachingLesson[]>([])
  const [enrichedMoments, setEnrichedMoments] = useState<CriticalMoment[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  // Track which pgn+elo combination we last processed to avoid re-running on re-render
  const lastPgnRef = useRef('')
  const lastEloRef = useRef(0)

  // Clear stale lessons immediately when a new game loads — prevents old game's
  // lessons from flashing before the new game's lessons arrive.
  useEffect(() => {
    setLessons([])
    setEnrichedMoments([])
    setCurrentIndex(0)
    lastPgnRef.current = ''
    lastEloRef.current = 0
  }, [pgn])

  useEffect(() => {
    if (!pgn || criticalMoments.length === 0 || moveEvals.length === 0) return
    if (pgn === lastPgnRef.current && userElo === lastEloRef.current) return

    lastPgnRef.current = pgn
    lastEloRef.current = userElo

    // Step 1: Enrich moments with real features + analysis facts
    let enriched: CriticalMoment[]
    try {
      enriched = enrichCriticalMoments(criticalMoments, moveEvals, pgn, userElo)
    } catch (err) {
      console.error('[useCoaching] enrichCriticalMoments failed:', err)
      enriched = criticalMoments
    }
    setEnrichedMoments(enriched)

    // Step 2: Initialize lesson placeholders
    const initial: CoachingLesson[] = enriched.map(moment => {
      const analysisFacts = moment.analysisFacts ?? buildFallbackAnalysisFacts(moment)
      const category = analysisFacts.category
      const isThinkFirst = CHECKLIST_CATEGORIES.has(category)
      return {
        moment,
        lessonText: null,
        category,
        categoryName: analysisFacts.categoryName ?? CATEGORIES[category]?.name ?? null,
        confidence: 100,
        isLoading: true,
        error: null,
        requiresChecklistFirst: isThinkFirst,
        checklistRevealed: !isThinkFirst, // immediately revealed for non-think-first
      }
    })
    setLessons(initial)
    setCurrentIndex(0)

    // Step 3: Fetch lessons from backend for each enriched moment
    enriched.forEach((moment, idx) => {
      try {
        const analysisFacts = moment.analysisFacts ?? buildFallbackAnalysisFacts(moment)
        const eloBand = getCacheBand(userElo)
        const tcSeconds = parseInt(timeControl, 10) || 600
        const tcLabel = classifyTimeControl(tcSeconds)
        const positionHash = btoa(`${moment.fenAfter}:${eloBand}`).slice(0, 32)

        const requestBody = {
          user_elo: userElo,
          opponent_elo: userElo,
          time_control: timeControl,
          time_control_label: tcLabel,
          game_phase: moment.features.gamePhase,
          move_number: moment.moveNumber,
          move_played: moment.movePlayed,
          eval_before: moment.evalBefore,
          eval_after: moment.evalAfter,
          eval_swing_cp: moment.evalSwing,
          category: analysisFacts.category,
          mistake_type: analysisFacts.mistakeType,
          confidence: moment.classification?.confidence ?? 80,
          verified_facts: analysisFacts.factList,
          engine_move_idea: [
            moment.features.engineMoveImpact?.description,
            moment.features.engineMoveImpact?.mainIdea,
          ].filter(Boolean).join('. ')
            || (moment.engineBest[0] ? `A better approach existed in this position` : 'A better move existed'),
          elo_band: eloBand,
          position_hash: positionHash,
          color: moment.color,
          backend_game_id: backendGameId ?? null,
          platform_game_id: platformGameId ?? null,
          platform: platform ?? null,
        }

        api.post<LessonResponse>('/coaching/lesson', requestBody, { timeoutMs: 35000 })
          .then(res => {
            setLessons(prev => prev.map((l, i) =>
              i === idx
                ? {
                    ...l,
                    lessonText: res.lesson,
                    category: res.category ?? l.category,
                    categoryName: (res.category && CATEGORIES[res.category]?.name) ?? l.categoryName,
                    isLoading: false,
                  }
                : l,
            ))
          })
          .catch(err => {
            const message = err instanceof ApiError
              ? (err.status === 0 ? err.message : `Failed to load lesson (${err.status})`)
              : 'Failed to load lesson'
            setLessons(prev => prev.map((l, i) =>
              i === idx
                ? { ...l, isLoading: false, error: message }
                : l,
            ))
            console.error('[useCoaching] lesson fetch failed:', err)
          })
      } catch (err) {
        console.error('[useCoaching] lesson setup failed synchronously:', err)
        setLessons(prev => prev.map((l, i) =>
          i === idx
            ? { ...l, isLoading: false, error: 'Failed to prepare lesson' }
            : l,
        ))
      }
    })
  }, [pgn, criticalMoments, moveEvals, userElo, timeControl, backendGameId, platformGameId, platform])

  /** Reveal the lesson for a Think First moment (after user engages with checklist) */
  const revealLesson = (idx: number) => {
    setLessons(prev => prev.map((l, i) =>
      i === idx ? { ...l, checklistRevealed: true } : l,
    ))
  }

  const currentLesson = lessons[currentIndex] ?? null

  return {
    enrichedMoments,
    lessons,
    currentLesson,
    currentIndex,
    setCurrentIndex,
    revealLesson,
    totalLessons: lessons.length,
  }
}
