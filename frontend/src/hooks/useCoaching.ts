// useCoaching.ts — Coaching pipeline hook
// Orchestrates: feature extraction → classification → LLM lesson fetch → Think First state
//
// Think First (MVP):
//   - TACTICAL_01 or TACTICAL_02 at confidence >= 70 → show blunder-check checklist first
//   - After user taps "Show lesson" → reveal the 5-step lesson
//   - All other principles → reveal lesson immediately

import { useState, useEffect, useRef } from 'react'
import type { CriticalMoment } from '../chess/types'
import type { MoveEval } from '../engine/analysis'
import { enrichCriticalMoments } from '../chess/features'
import { buildVerifiedFacts } from '../chess/classifier'
import { getCacheBand, classifyTimeControl } from '../chess/eloConfig'
import { PRINCIPLES } from '../chess/taxonomy'
import { api } from '../api/client'

export interface LessonResponse {
  lesson: string
  principle_id: string | null
  confidence: number
  cached: boolean
}

export interface CoachingLesson {
  moment: CriticalMoment
  lessonText: string | null
  principleId: string | null
  principleName: string | null
  confidence: number
  isLoading: boolean
  error: string | null
  /** Think First: TACTICAL_01/02 at confidence >= 70, checklist shown before lesson */
  requiresChecklistFirst: boolean
  checklistRevealed: boolean
}

const THINK_FIRST_PRINCIPLES = new Set(['TACTICAL_01', 'TACTICAL_02'])
const THINK_FIRST_CONFIDENCE_THRESHOLD = 70

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

  useEffect(() => {
    if (!pgn || criticalMoments.length === 0 || moveEvals.length === 0) return
    if (pgn === lastPgnRef.current && userElo === lastEloRef.current) return

    lastPgnRef.current = pgn
    lastEloRef.current = userElo

    // Step 1: Enrich moments with real features + classification
    let enriched: CriticalMoment[]
    try {
      enriched = enrichCriticalMoments(criticalMoments, moveEvals, pgn, userElo)
    } catch (err) {
      console.error('[useCoaching] enrichCriticalMoments failed:', err)
      enriched = criticalMoments
    }
    // Only keep moments where the classifier found a principle with meaningful confidence.
    // Filter out moments with null classification, zero confidence, or empty principle IDs.
    const classified = enriched.filter(m =>
      m.classification !== null &&
      m.classification.confidence >= 60 &&
      m.classification.principleId
    )
    setEnrichedMoments(classified)

    // Step 2: Initialize lesson placeholders
    const initial: CoachingLesson[] = classified.map(moment => {
      const { classification } = moment
      const isThinkFirst = !!(
        classification &&
        THINK_FIRST_PRINCIPLES.has(classification.principleId) &&
        classification.confidence >= THINK_FIRST_CONFIDENCE_THRESHOLD
      )
      return {
        moment,
        lessonText: null,
        principleId: classification?.principleId ?? null,
        principleName: classification ? (PRINCIPLES[classification.principleId]?.name ?? null) : null,
        confidence: classification?.confidence ?? 0,
        isLoading: !!classification, // only load if we have a classification
        error: null,
        requiresChecklistFirst: isThinkFirst,
        checklistRevealed: !isThinkFirst, // immediately revealed for non-think-first
      }
    })
    setLessons(initial)
    setCurrentIndex(0)

    // Step 3: Fetch lessons from backend for each classified moment
    classified.forEach((moment, idx) => {
      if (!moment.classification) return

      const { classification } = moment
      const principle = PRINCIPLES[classification.principleId]
      const verifiedFacts = buildVerifiedFacts(
        moment.features,
        {
          evalSwing: moment.evalSwing,
          moveNumber: moment.moveNumber,
          color: moment.color,
          movePlayed: moment.movePlayed,
        },
        classification.principleId,
      )

      const eloBand = getCacheBand(userElo)
      const tcSeconds = parseInt(timeControl, 10) || 600
      const tcLabel = classifyTimeControl(tcSeconds)
      // Simple position hash: fen + principle + elo band (good enough for cache key)
      const positionHash = btoa(`${moment.fenAfter}:${classification.principleId}:${eloBand}`).slice(0, 32)

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
        principle_id: classification.principleId,
        principle_name: principle?.name ?? null,
        principle_description: principle?.description ?? null,
        principle_takeaway: principle?.takeawayTemplate ?? null,
        confidence: classification.confidence,
        verified_facts: verifiedFacts,
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

      api.post<LessonResponse>('/coaching/lesson', requestBody)
        .then(res => {
          setLessons(prev => prev.map((l, i) =>
            i === idx
              ? { ...l, lessonText: res.lesson, isLoading: false }
              : l,
          ))
        })
        .catch(err => {
          setLessons(prev => prev.map((l, i) =>
            i === idx
              ? { ...l, isLoading: false, error: 'Failed to load lesson' }
              : l,
          ))
          console.error('[useCoaching] lesson fetch failed:', err)
        })
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
