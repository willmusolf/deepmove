// useCoaching.ts — Coaching pipeline hook
// Orchestrates: feature extraction → analysis facts → LLM lesson fetch
// Also builds MoveComment[] — a narrative comment for every move in the game.

import { useState, useEffect, useRef } from 'react'
import type { AnalysisFacts, CriticalMoment, MistakeType } from '../chess/types'
import type { MoveEval, MoveGrade } from '../engine/analysis'
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
}

/** A short comment for every move in the game — shown in the narrative view. */
export interface MoveComment {
  moveNumber: number
  color: 'white' | 'black'
  moveSan: string
  comment: string
  grade: MoveGrade
  isCritical: boolean
  /** Index into lessons[] if isCritical, otherwise null */
  lessonIdx: number | null
}

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

export function gradeToComment(grade: MoveGrade, moveSan: string): string {
  switch (grade) {
    case 'brilliant': return `Brilliant — ${moveSan} was a spectacular find.`
    case 'great': return `Great defensive resource.`
    case 'best': return `Best move.`
    case 'excellent': return `Good, solid choice.`
    case 'good': return `Reasonable move.`
    case 'inaccuracy': return `Slight inaccuracy — a better option was available.`
    case 'mistake': return `Mistake — this gave away some of your advantage.`
    case 'blunder': return `Blunder — this significantly hurt your position.`
    case 'miss': return `Missed opportunity — there was a stronger move available here.`
    case 'forced': return `Forced move.`
    default: return ''
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
  const [moveComments, setMoveComments] = useState<MoveComment[]>([])
  const [enrichedMoments, setEnrichedMoments] = useState<CriticalMoment[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  // Tracks which moments (by "moveNumber:color") have already had a lesson fetched.
  // Prevents re-fetching when criticalMoments updates mid-analysis.
  const fetchedKeysRef = useRef<Set<string>>(new Set())

  // Clear stale data when a new game loads
  useEffect(() => {
    setLessons([])
    setMoveComments([])
    setEnrichedMoments([])
    setCurrentIndex(0)
    fetchedKeysRef.current = new Set()
  }, [pgn])

  useEffect(() => {
    if (!pgn || criticalMoments.length === 0 || moveEvals.length === 0) return

    // Step 1: Enrich moments with real features + analysis facts
    let enriched: CriticalMoment[]
    try {
      enriched = enrichCriticalMoments(criticalMoments, moveEvals, pgn, userElo)
    } catch (err) {
      console.error('[useCoaching] enrichCriticalMoments failed:', err)
      enriched = criticalMoments
    }
    // Sort chronologically so dot 1 = earliest lesson, dot 2 = next, etc.
    enriched.sort((a, b) => {
      const aIdx = (a.moveNumber - 1) * 2 + (a.color === 'black' ? 1 : 0)
      const bIdx = (b.moveNumber - 1) * 2 + (b.color === 'black' ? 1 : 0)
      return aIdx - bIdx
    })
    setEnrichedMoments(enriched)

    // Step 2: Build a lookup of critical moment positions
    const criticalKey = (moveNumber: number, color: 'white' | 'black') => `${moveNumber}:${color}`
    const criticalMap = new Map<string, { idx: number; moment: CriticalMoment }>()
    enriched.forEach((m, idx) => {
      criticalMap.set(criticalKey(m.moveNumber, m.color), { idx, moment: m })
    })

    // Step 3: Build MoveComment for every move
    const comments: MoveComment[] = moveEvals.map(me => {
      const key = criticalKey(me.moveNumber, me.color)
      const critical = criticalMap.get(key)
      const isCritical = !!critical
      const analysisFacts = isCritical
        ? (critical!.moment.analysisFacts ?? buildFallbackAnalysisFacts(critical!.moment))
        : null

      let comment: string
      if (isCritical && analysisFacts) {
        // Use the deterministic one-line failure fact as the inline comment
        comment = analysisFacts.missedResponsibility
          .replace(/^What your move failed to do: /, '')
          .replace(/\.$/, '')
        // Capitalize first letter
        comment = comment.charAt(0).toUpperCase() + comment.slice(1)
      } else {
        comment = gradeToComment(me.grade, me.san)
      }

      return {
        moveNumber: me.moveNumber,
        color: me.color,
        moveSan: me.san,
        comment,
        grade: me.grade,
        isCritical,
        lessonIdx: isCritical ? critical!.idx : null,
      }
    })
    setMoveComments(comments)

    // Step 4: Rebuild the full lessons array every run to keep lessonIdx consistent.
    // Preserve already-fetched lesson text from previous runs.
    const newMoments = enriched.filter(m => !fetchedKeysRef.current.has(`${m.moveNumber}:${m.color}`))
    setLessons(prev => {
      const prevByKey = new Map(prev.map(l => [`${l.moment.moveNumber}:${l.moment.color}`, l]))
      return enriched.map(moment => {
        const key = `${moment.moveNumber}:${moment.color}`
        const existing = prevByKey.get(key)
        if (existing) return existing  // preserve fetched lesson text + loading state
        const analysisFacts = moment.analysisFacts ?? buildFallbackAnalysisFacts(moment)
        const category = analysisFacts.category
        return {
          moment,
          lessonText: null,
          category,
          categoryName: analysisFacts.categoryName ?? CATEGORIES[category]?.name ?? null,
          confidence: moment.classification?.confidence ?? 80,
          isLoading: true,
          error: null,
        }
      })
    })

    // Step 5: Fetch LLM lessons for each NEW moment only.
    // Stagger requests by 1.5s each so a cold Neon DB isn't slammed all at once.
    newMoments.forEach((moment, idx) => {
      fetchedKeysRef.current.add(`${moment.moveNumber}:${moment.color}`)
      setTimeout(() => { try {
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

        const momentKey = `${moment.moveNumber}:${moment.color}`
        const fetchLesson = (attempt: number) =>
          api.post<LessonResponse>('/coaching/lesson', requestBody, { timeoutMs: 30000 })
            .then(res => {
              setLessons(prev => prev.map(l =>
                `${l.moment.moveNumber}:${l.moment.color}` === momentKey
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
              if (attempt === 0) {
                // Show retrying state immediately so dots display numbers (not loading dots)
                setLessons(prev => prev.map(l =>
                  `${l.moment.moveNumber}:${l.moment.color}` === momentKey
                    ? { ...l, isLoading: false, error: 'Retrying…' }
                    : l,
                ))
                setTimeout(() => {
                  setLessons(prev => prev.map(l =>
                    `${l.moment.moveNumber}:${l.moment.color}` === momentKey && l.error === 'Retrying…'
                      ? { ...l, isLoading: true, error: null }
                      : l,
                  ))
                  fetchLesson(1)
                }, 3000)
                return
              }
              const message = err instanceof ApiError
                ? (err.status === 0 ? err.message : `Failed to load lesson (${err.status})`)
                : 'Failed to load lesson'
              setLessons(prev => prev.map(l =>
                `${l.moment.moveNumber}:${l.moment.color}` === momentKey
                  ? { ...l, isLoading: false, error: message }
                  : l,
              ))
              console.error('[useCoaching] lesson fetch failed after retry:', err)
            })
        fetchLesson(0)
      } catch (err) {
        console.error('[useCoaching] lesson setup failed synchronously:', err)
        const momentKey2 = `${moment.moveNumber}:${moment.color}`
        setLessons(prev => prev.map(l =>
          `${l.moment.moveNumber}:${l.moment.color}` === momentKey2
            ? { ...l, isLoading: false, error: 'Failed to prepare lesson' }
            : l,
        ))
      } }, idx * 2000)
    })
  }, [pgn, criticalMoments, moveEvals, userElo, timeControl, backendGameId, platformGameId, platform])

  const currentLesson = lessons[currentIndex] ?? null

  return {
    enrichedMoments,
    lessons,
    moveComments,
    currentLesson,
    currentIndex,
    setCurrentIndex,
    totalLessons: lessons.length,
  }
}
