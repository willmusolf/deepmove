// useBotPlay.ts — Core game loop for Play vs Bot mode.
// Manages a dedicated StockfishEngine instance (3rd worker), move tree, and clocks.
// All persistent state lives in playStore; this hook owns the async lifecycle.
//
// PREMOVE ARCHITECTURE (Virtual FEN approach):
// Premoves are managed as a queue. Instead of overlaying fake piece positions,
// we compute a "virtual FEN" (chess.js replay of all queued premoves on top of
// the current real FEN) and pass it as the board's fen prop. Chessground sees it
// as the real position and animates pieces there naturally.
//
// A single handleBoardMove callback handles both real moves and queue appends:
// - Bot thinking OR queue non-empty → append to queue
// - Bot idle, queue empty → apply as real move
//
// After the bot moves, drainPremoveQueue consumes one entry from the queue,
// validates it, and applies it synchronously. This chain continues until the
// queue is empty or a premove becomes illegal (clearing the whole queue).
//
// KEY INVARIANT: ChessBoard's premovable is disabled. The board's fen prop is
// always virtualBoardFen (real FEN + queued premoves applied). The user can
// always drag their own pieces because userPerspective prop keeps movable.color
// set to their color regardless of whose turn the FEN technically says it is.

import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { Chess } from 'chess.js'
import { StockfishEngine } from '../engine/stockfish'
import {
  clampBotElo,
  usePlayStore,
  STARTING_FEN,
  type PlayConfig,
  type TimeControl,
} from '../stores/playStore'
import { msToHHMMSS } from '../utils/format'
import { useGameStore } from '../stores/gameStore'
import { useAuthStore } from '../stores/authStore'
import { playSharedMoveSound } from './useSound'
import type { MoveNode } from '../chess/types'
import { applyPremoveForcefully } from '../components/Board/ChessBoard'
import { getSelfDisplayName } from '../utils/selfDisplayName'
import { chooseMaterialAwareBotMove } from '../chess/botTactics'

export interface BotReviewPayload {
  pgn: string
  userColor: 'white' | 'black'
  userElo: number | null
  opponent: string
  opponentRating: number
  result: 'W' | 'L' | 'D'
  timeControl: string
  endTime: number
}

interface BotStrengthProfile {
  engineElo: number
  movetime: number
}

function getCalibratedBotElo(botElo: number): number {
  const safeBotElo = clampBotElo(botElo)
  if (safeBotElo <= 300) return Math.min(2850, safeBotElo + 100)
  if (safeBotElo <= 800) return Math.min(2850, safeBotElo + 300)
  if (safeBotElo <= 1200) return Math.min(2850, safeBotElo + 300)
  if (safeBotElo <= 1600) return Math.min(2850, safeBotElo + 200)
  if (safeBotElo <= 2000) return Math.min(2850, safeBotElo + 150)
  if (safeBotElo <= 2400) return Math.min(2850, safeBotElo + 100)
  return safeBotElo
}

/** Browser bot calibration:
 *  low UCI_Elo plus very short movetimes tends to produce cartoonish blunders.
 *  We keep the user-facing slider value, but nudge the internal engine profile
 *  upward and give weaker settings a bit more think time so club-level games
 *  feel steadier and more realistic. */
export function getBotStrengthProfile(botElo: number, tc: TimeControl): BotStrengthProfile {
  const safeBotElo = clampBotElo(botElo)
  const baseMovetime =
    tc === '5+0' ? 250
      : tc === '10+0' ? 450
        : tc === '15+10' ? 650
          : 900

  const stabilityBonus =
    safeBotElo <= 300 ? 300
      : safeBotElo <= 900 ? 500
        : safeBotElo <= 1200 ? 450
          : safeBotElo <= 1600 ? 220
            : safeBotElo <= 2200 ? 120
            : 0

  return {
    engineElo: getCalibratedBotElo(safeBotElo),
    movetime: baseMovetime + stabilityBonus,
  }
}

/** Generate a PGN string from the play tree main line */
function generatePgn(
  tree: ReturnType<typeof usePlayStore.getState>['tree'],
  rootId: string,
  config: PlayConfig,
  result: ReturnType<typeof usePlayStore.getState>['result'],
  userDisplayName: string,
): string {
  // Walk main line
  const nodes: MoveNode[] = []
  let id: string | null = rootId
  while (id && tree[id]) {
    nodes.push(tree[id])
    id = tree[id].childIds[0] ?? null
  }

  const white = config.userColor === 'white' ? userDisplayName : `Stockfish (${config.botElo})`
  const black = config.userColor === 'black' ? userDisplayName : `Stockfish (${config.botElo})`
  const whiteElo = config.userColor === 'white' ? '?' : String(config.botElo)
  const blackElo = config.userColor === 'black' ? '?' : String(config.botElo)

  const resultStr = result === 'user-win'
    ? (config.userColor === 'white' ? '1-0' : '0-1')
    : result === 'user-loss'
      ? (config.userColor === 'white' ? '0-1' : '1-0')
      : '1/2-1/2'

  const header = [
    `[Event "DeepMove Bot Game"]`,
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[WhiteElo "${whiteElo}"]`,
    `[BlackElo "${blackElo}"]`,
    `[Result "${resultStr}"]`,
  ].join('\n')

  const parts: string[] = []
  const firstBlackMove = nodes.length > 0 && nodes[0].color === 'black'
  if (firstBlackMove) parts.push('1...')

  nodes.forEach((node) => {
    if (node.color === 'white') parts.push(`${node.moveNumber}.`)
    parts.push(node.san)
  })
  parts.push(resultStr)

  return `${header}\n\n${parts.join(' ')}`
}

/**
 * Build a MoveNode and atomically append it to the play store tree.
 * Returns the constructed MoveNode.
 */
function applyMoveToStore(
  from: string,
  to: string,
  san: string,
  newFen: string,
  preMoveState: { moveCounter: number; currentPath: string[]; currentFen: string },
  newPremoveQueue?: Array<{ orig: string; dest: string }>,
): MoveNode {
  const moveColor = preMoveState.currentFen.split(' ')[1] === 'w' ? 'white' : 'black'
  const moveNum = parseInt(preMoveState.currentFen.split(' ')[5] ?? '1', 10)
  const counter = preMoveState.moveCounter + 1
  const nodeId = `p${counter}`
  const parentId = preMoveState.currentPath[preMoveState.currentPath.length - 1] ?? null

  const node: MoveNode = {
    id: nodeId,
    san,
    from,
    to,
    fen: newFen,
    childIds: [],
    parentId,
    moveNumber: moveNum,
    color: moveColor,
    isMainLine: true,
  }

  usePlayStore.setState(s => {
    const newTree = { ...s.tree, [node.id]: node }
    if (node.parentId && newTree[node.parentId]) {
      const parent = { ...newTree[node.parentId] }
      if (!parent.childIds.includes(node.id)) {
        parent.childIds = [...parent.childIds, node.id]
      }
      newTree[node.parentId] = parent
    }
    const newPath = [...s.currentPath, node.id]
    const newRootId = s.rootId ?? node.id
    return {
      moveCounter: s.moveCounter + 1,
      tree: newTree,
      rootId: newRootId,
      currentPath: newPath,
      currentFen: newFen,
      ...(newPremoveQueue !== undefined ? { premoveQueue: newPremoveQueue } : {}),
    }
  })

  return node
}

export function useBotPlay(onNavigateToReview: (payload: BotReviewPayload) => void) {
  const botEngineRef = useRef<StockfishEngine | null>(null)
  const botMoveRequestTokenRef = useRef(0)
  const clockRafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(0)
  const [botEngineReady, setBotEngineReady] = useState(false)
  const botEngineReadyRef = useRef(false)
  const [premoveSnapToken, setPremoveSnapToken] = useState(0)
  const playStatus = usePlayStore(s => s.status)
  const clockRunning = usePlayStore(s => s.clockRunning)
  const isBotThinking = usePlayStore(s => s.isBotThinking)

  // ── Virtual board FEN ──────────────────────────────────────────────────────
  // The FEN passed to ChessBoard — real position with all queued premoves applied.
  // Chessground sees this as the real board state and animates pieces into position.
  //
  // premoveQueue lives in the Zustand play store (alongside currentFen) so that
  // drainPremoveQueue can update BOTH atomically in a single setState call.
  // If they lived in separate stores (Zustand + React useState), two separate renders
  // would fire, causing an intermediate wrong virtualBoardFen → snap-back bug.
  const currentFen = usePlayStore(s => s.currentFen)
  const userColor = usePlayStore(s => s.config?.userColor)
  const premoveQueue = usePlayStore(s => s.premoveQueue)

  const virtualBoardFen = useMemo(() => {
    if (premoveQueue.length === 0) return currentFen
    const userFenColor = userColor === 'white' ? 'w' : 'b'
    let fen = currentFen
    for (const pm of premoveQueue) {
      try {
        const parts = fen.split(' ')
        parts[1] = userFenColor    // force user's turn — currentFen has opponent to move
        parts[3] = '-'             // clear stale en passant
        const chess = new Chess(parts.join(' '))
        chess.move({ from: pm.orig as any, to: pm.dest as any, promotion: 'q' })
        fen = chess.fen()
      } catch {
        // Legal move threw (e.g. pinned piece). Force-apply for display purposes.
        // drainPremoveQueue will validate against the real FEN when the premove fires.
        fen = applyPremoveForcefully(fen, userFenColor, pm.orig, pm.dest)
      }
    }
    return fen
  }, [currentFen, premoveQueue, userColor])

  // ── Mutual exclusion guard ────────────────────────────────────────────────
  // Prevents concurrent execution of move processing. Guards against stale
  // chessground `after` callbacks arriving via setTimeout(1).
  const isProcessingMoveRef = useRef(false)
  const positionCountsRef = useRef<Map<string, number>>(new Map())

  function getPositionKey(fen: string): string {
    return fen.split(' ').slice(0, 4).join(' ')
  }
  function recordPosition(fen: string) {
    const key = getPositionKey(fen)
    positionCountsRef.current.set(key, (positionCountsRef.current.get(key) ?? 0) + 1)
  }
  function isThreefoldByHistory(fen: string): boolean {
    return (positionCountsRef.current.get(getPositionKey(fen)) ?? 0) >= 3
  }

  const store = usePlayStore

  /** Clear the premove queue in the Zustand store. */
  const clearPremoveQueue = useCallback(() => {
    usePlayStore.setState({ premoveQueue: [] })
  }, [])

  const invalidatePendingBotMove = useCallback(() => {
    botMoveRequestTokenRef.current += 1
    botEngineRef.current?.stop()
    usePlayStore.getState().setIsBotThinking(false)
  }, [])

  const cancelPremoveQueue = useCallback(() => {
    const { premoveQueue } = usePlayStore.getState()
    if (premoveQueue.length === 0) return
    clearPremoveQueue()
    setPremoveSnapToken(token => token + 1)
  }, [clearPremoveQueue])

  // ── Engine lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    const engine = new StockfishEngine()
    botEngineRef.current = engine
    engine.initialize().then(() => {
      botEngineReadyRef.current = true
      setBotEngineReady(true)
      // Session restore is handled by the safety-net useEffect below —
      // when botEngineReady becomes true and it's the bot's turn, the
      // effect triggers scheduleBotMove automatically.
    }).catch(console.error)

    return () => {
      cancelClockRaf()
      invalidatePendingBotMove()
      botEngineReadyRef.current = false
      engine.terminate()
      botEngineRef.current = null
    }
  }, [cancelClockRaf, invalidatePendingBotMove])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Safety net: recover when the bot should move but nothing is happening ─
  // If the normal chain (handleBoardMove → scheduleBotMove) breaks for any
  // reason (zoom interruption, engine hang, session restore, etc.), this
  // effect detects the inconsistency and re-triggers the bot after a delay.
  const safetyNetRetryRef = useRef(0)
  const SAFETY_NET_MAX_RETRIES = 3

  useEffect(() => {
    if (playStatus !== 'playing') { safetyNetRetryRef.current = 0; return }
    if (!botEngineReady) return
    if (isBotThinking) { safetyNetRetryRef.current = 0; return }

    const state = store.getState()
    if (!state.config) return
    const turnColor = state.currentFen.split(' ')[1] === 'w' ? 'white' : 'black'
    if (turnColor === state.config.userColor) return  // user's turn — nothing to do

    // It's the bot's turn but bot isn't thinking. Delay to avoid racing with
    // the normal chain (which sets isBotThinking=true synchronously).
    if (safetyNetRetryRef.current >= SAFETY_NET_MAX_RETRIES) return

    const timerId = setTimeout(() => {
      const s = store.getState()
      if (s.status !== 'playing' || s.isBotThinking) return
      const tc = s.currentFen.split(' ')[1] === 'w' ? 'white' : 'black'
      if (tc === s.config?.userColor) return

      safetyNetRetryRef.current++
      scheduleBotMove(s.currentFen)
    }, 500)

    return () => clearTimeout(timerId)
  }, [playStatus, isBotThinking, currentFen, botEngineReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clock RAF loop ───────────────────────────────────────────────────────
  const startClockRaf = useCallback(() => {
    lastTickRef.current = performance.now()
    function tick() {
      const now = performance.now()
      const elapsed = now - lastTickRef.current
      lastTickRef.current = now

      const state = store.getState()
      if (!state.clockRunning || state.status !== 'playing') return

      const turnColor = state.currentFen.split(' ')[1] === 'w' ? 'white' : 'black'
      state.tickClock(turnColor, elapsed)

      // Check for time loss
      const updated = store.getState()
      const timeMs = turnColor === 'white' ? updated.whiteTimeMs : updated.blackTimeMs
      if (timeMs !== null && timeMs <= 0) {
        const isUserColor = turnColor === updated.config!.userColor
        updated.setResult(
          isUserColor ? 'user-loss' : 'user-win',
          isUserColor ? 'user-time' : 'bot-time',
        )
        return
      }

      clockRafRef.current = requestAnimationFrame(tick)
    }
    clockRafRef.current = requestAnimationFrame(tick)
  }, [store])

  const cancelClockRaf = useCallback(() => {
    if (clockRafRef.current !== null) {
      cancelAnimationFrame(clockRafRef.current)
      clockRafRef.current = null
    }
  }, [])

  useEffect(() => {
    if (playStatus === 'playing' && clockRunning) {
      if (clockRafRef.current === null) startClockRaf()
      return
    }

    cancelClockRaf()
  }, [playStatus, clockRunning, startClockRaf, cancelClockRaf])

  // ── Check terminal position ──────────────────────────────────────────────
  function checkTerminal(chess: Chess): boolean {
    const state = store.getState()
    if (chess.isCheckmate()) {
      // The side that just moved wins
      const justMoved = chess.turn() === 'w' ? 'black' : 'white'
      const userWins = justMoved === state.config!.userColor
      state.setResult(userWins ? 'user-win' : 'user-loss', 'checkmate')
      return true
    }
    if (chess.isStalemate()) {
      state.setResult('draw', 'stalemate')
      return true
    }
    if (chess.isInsufficientMaterial()) {
      state.setResult('draw', 'insufficient-material')
      return true
    }
    if (isThreefoldByHistory(chess.fen())) {
      state.setResult('draw', 'threefold')
      return true
    }
    if (chess.isDraw()) {  // 50-move rule
      state.setResult('draw', 'fifty-move')
      return true
    }
    return false
  }

  // ── Drain premove queue ───────────────────────────────────────────────────
  // Called synchronously after the bot move is committed to the store.
  // Consumes one premove from the front of the queue, validates it against
  // the post-bot-move FEN, and applies it. Returns the new FEN on success,
  // null if the queue is empty or the first premove is illegal (in which case
  // the entire queue is cleared — Chess.com behaviour).
  function drainPremoveQueue(postBotFen: string): string | null {
    const currentQueue = usePlayStore.getState().premoveQueue
    if (currentQueue.length === 0) return null

    const premove = currentQueue[0]

    const state = store.getState()
    if (state.status !== 'playing') {
      clearPremoveQueue()
      return null
    }

    // Validate with chess.js against the position after the bot moved
    const chess = new Chess(postBotFen)
    let moveResult
    try {
      moveResult = chess.move({ from: premove.orig, to: premove.dest, promotion: 'q' })
    } catch {
      moveResult = null
    }

    if (!moveResult) {
      // Illegal premove — clear entire queue (Chess.com behaviour)
      clearPremoveQueue()
      return null
    }

    // Consume from front of queue — newQueue is passed to applyMoveToStore so
    // currentFen and premoveQueue update in ONE atomic Zustand setState (prevents
    // the intermediate-render snap-back that happens with separate state updates).
    const newQueue = currentQueue.slice(1)

    const premoveFen = chess.fen()
    const premoveSan = moveResult.san

    // Read fresh state since the bot move setState just ran synchronously
    const freshState = store.getState()
    const moveColor = freshState.currentFen.split(' ')[1] === 'w' ? 'white' : 'black'

    // Sanity check: it should be the user's turn
    if (moveColor !== freshState.config!.userColor) {
      clearPremoveQueue()
      return null
    }

    playSharedMoveSound(premoveSan)
    isProcessingMoveRef.current = true
    applyMoveToStore(premove.orig, premove.dest, premoveSan, premoveFen, freshState, newQueue)

    // Add increment to user's clock
    usePlayStore.getState().addIncrement(moveColor)
    isProcessingMoveRef.current = false
    recordPosition(premoveFen)

    return premoveFen
  }

  // ── Bot move ─────────────────────────────────────────────────────────────
  const scheduleBotMove = useCallback(async (fen: string) => {
    const state = store.getState()
    if (!botEngineRef.current || !botEngineReadyRef.current || state.status !== 'playing') return

    const requestToken = ++botMoveRequestTokenRef.current
    const isStale = () => (
      requestToken !== botMoveRequestTokenRef.current
      || store.getState().status !== 'playing'
      || store.getState().currentFen !== fen
    )

    state.setIsBotThinking(true)
    const botMoveStart = performance.now()

    // Re-check status (user may have resigned immediately)
    if (store.getState().status !== 'playing') {
      store.getState().setIsBotThinking(false)
      return
    }

    const config = store.getState().config!
    const profile = getBotStrengthProfile(config.botElo, config.timeControl)

    const BOT_MOVE_TIMEOUT_MS = 15_000
    let uci: string
    try {
      uci = await Promise.race([
        botEngineRef.current.getBotMove(fen, profile.engineElo, profile.movetime),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Bot move timed out')), BOT_MOVE_TIMEOUT_MS)
        ),
      ])
    } catch (e) {
      if (isStale()) return
      console.error('Bot move failed', e)
      store.getState().setIsBotThinking(false)
      return
    }
    if (isStale()) {
      store.getState().setIsBotThinking(false)
      return
    }
    uci = chooseMaterialAwareBotMove(fen, uci, config.botElo)

    // Pad to configured think time (botSpeed controls how "human" the bot feels)
    const elapsed = performance.now() - botMoveStart
    const MIN_WAIT: Record<string, number> = { instant: 0, fast: 800, normal: 1500, slow: 3000 }
    const minWait = MIN_WAIT[config.botSpeed ?? 'normal'] ?? 1500
    const remaining = Math.max(0, minWait - elapsed)
    if (remaining > 0) {
      await new Promise<void>(r => setTimeout(r, remaining))
    }
    if (isStale()) {
      store.getState().setIsBotThinking(false)
      return
    }

    if (!uci || uci === '(none)') {
      store.getState().setIsBotThinking(false)
      return
    }

    // Apply bot move via chess.js
    const chess = new Chess(fen)
    const from = uci.slice(0, 2)
    const to = uci.slice(2, 4)
    const promotion = uci[4] ?? 'q'
    const moveResult = chess.move({ from, to, promotion })
    if (isStale()) {
      store.getState().setIsBotThinking(false)
      return
    }
    if (!moveResult) {
      store.getState().setIsBotThinking(false)
      return
    }

    const botNewFen = chess.fen()
    const san = moveResult.san

    // Build MoveNode for the bot move
    const currentState = store.getState()
    const counter = currentState.moveCounter + 1
    const nodeId = `p${counter}`
    const parentId = currentState.currentPath[currentState.currentPath.length - 1] ?? null
    const moveColor = fen.split(' ')[1] === 'w' ? 'white' : 'black'
    const moveNum = parseInt(fen.split(' ')[5] ?? '1', 10)

    const node: MoveNode = {
      id: nodeId,
      san,
      from,
      to,
      fen: botNewFen,
      childIds: [],
      parentId,
      moveNumber: moveNum,
      color: moveColor,
      isMainLine: true,
    }

    // Update store in one atomic batch so React renders once with fully consistent state.
    usePlayStore.setState(s => {
      const newTree = { ...s.tree, [node.id]: node }
      if (node.parentId && newTree[node.parentId]) {
        const parent = { ...newTree[node.parentId] }
        if (!parent.childIds.includes(node.id)) {
          parent.childIds = [...parent.childIds, node.id]
        }
        newTree[node.parentId] = parent
      }
      const newPath = [...s.currentPath, node.id]
      const newRootId = s.rootId ?? node.id
      return {
        moveCounter: s.moveCounter + 1,
        tree: newTree,
        rootId: newRootId,
        currentPath: newPath,
        currentFen: botNewFen,
        isBotThinking: false,
      }
    })

    playSharedMoveSound(san)
    // Add increment to bot's clock after move
    usePlayStore.getState().addIncrement(moveColor)

    // Check terminal after bot move
    recordPosition(botNewFen)
    const chess3 = new Chess(botNewFen)
    if (checkTerminal(chess3)) return

    // ── Premove handling ──────────────────────────────────────────────────
    // Drain one premove from the queue SYNCHRONOUSLY before yielding to React.
    // This runs in the same microtask as the bot move's setState, so by the
    // time React re-renders, the store already contains both the bot move
    // AND the user's premove. No setTimeout(1) race, no stale FEN refs.
    const premoveFen = drainPremoveQueue(botNewFen)
    if (premoveFen) {
      // Check terminal after premove
      const chess4 = new Chess(premoveFen)
      if (checkTerminal(chess4)) return  // position already recorded in drainPremoveQueue

      // Premove applied — schedule the next bot move; it will drain the next
      // queued premove (if any) after it lands.
      await scheduleBotMove(premoveFen)
      return
    }

    // No premove — React will render the board with the bot's new FEN and
    // the user can make their move normally.

  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Unified board move handler ────────────────────────────────────────────
  // Single callback for all moves fired by ChessBoard's movable.events.after.
  // Decides whether to apply as a real move or append to the premove queue:
  //   - Bot thinking OR queue non-empty → append to premove queue
  //   - Bot idle, queue empty → apply as a real move
  // This replaces the old handleUserMove + handlePremoveSet split.
  const handleBoardMove = useCallback(async (from: string, to: string, san: string, newFen: string) => {
    // Guard against stale chessground `after` callbacks arriving via setTimeout(1)
    // after we already processed the same move as a premove in scheduleBotMove.
    if (isProcessingMoveRef.current) return

    const state = store.getState()
    if (state.status !== 'playing') return

    // Bot is thinking OR there are already queued premoves → append to queue
    if (state.isBotThinking || state.premoveQueue.length > 0) {
      usePlayStore.setState(s => ({
        premoveQueue: [...s.premoveQueue, { orig: from, dest: to }],
      }))
      return
    }

    // Bot idle, queue empty → apply as a real move
    const moveColor = state.currentFen.split(' ')[1] === 'w' ? 'white' : 'black'
    if (moveColor !== state.config!.userColor) return  // not user's turn

    // If the store already has this FEN as the current tip, the premove path
    // in scheduleBotMove already applied this move — skip the duplicate.
    const lastNodeId = state.currentPath[state.currentPath.length - 1]
    if (lastNodeId && state.tree[lastNodeId]?.fen === newFen) return

    isProcessingMoveRef.current = true
    playSharedMoveSound(san)

    applyMoveToStore(from, to, san, newFen, state)

    // Add increment to user's clock after move
    usePlayStore.getState().addIncrement(moveColor)

    isProcessingMoveRef.current = false

    // Clear the premove queue — user made a regular (non-premove) move
    clearPremoveQueue()

    // Check terminal
    recordPosition(newFen)
    const chess2 = new Chess(newFen)
    if (checkTerminal(chess2)) return

    // Schedule bot move
    await scheduleBotMove(newFen)
  }, [cancelPremoveQueue, scheduleBotMove])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start game ───────────────────────────────────────────────────────────
  const startGame = useCallback((config: PlayConfig) => {
    cancelClockRaf()
    invalidatePendingBotMove()
    cancelPremoveQueue()
    isProcessingMoveRef.current = false
    safetyNetRetryRef.current = 0
    positionCountsRef.current = new Map([[getPositionKey(STARTING_FEN), 1]])
    store.getState().startGame(config)

    // If user plays black, bot goes first
    if (config.userColor === 'black') {
      setTimeout(() => scheduleBotMove(STARTING_FEN), 100)
    }
  }, [invalidatePendingBotMove, scheduleBotMove])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resign ───────────────────────────────────────────────────────────────
  const resignGame = useCallback(() => {
    const state = store.getState()
    if (state.status !== 'playing') return
    invalidatePendingBotMove()
    cancelPremoveQueue()
    state.setResult('user-loss', 'resigned')
    cancelClockRaf()
  }, [cancelClockRaf, cancelPremoveQueue, invalidatePendingBotMove, store])

  // ── Review game ──────────────────────────────────────────────────────────
  const reviewGame = useCallback(() => {
    const state = store.getState()
    if (!state.rootId || !state.config) return

    const displayName = getSelfDisplayName(useAuthStore.getState().user)
    const pgn = generatePgn(state.tree, state.rootId, state.config, state.result, displayName)
    const previousUserElo = useGameStore.getState().userElo
    const reviewResult = state.result === 'user-win'
      ? 'W'
      : state.result === 'user-loss'
        ? 'L'
        : 'D'

    onNavigateToReview({
      pgn,
      userColor: state.config.userColor,
      userElo: previousUserElo && previousUserElo > 0 ? previousUserElo : null,
      opponent: `Stockfish (${state.config.botElo})`,
      opponentRating: state.config.botElo,
      result: reviewResult,
      timeControl: state.config.timeControl,
      endTime: Date.now(),
    })
  }, [onNavigateToReview, store])

  // ── Clock display helpers (exported for BotPlayPage) ─────────────────────
  const getWhiteClockDisplay = useCallback((): string | undefined => {
    return msToHHMMSS(usePlayStore.getState().whiteTimeMs)
  }, [])

  const getBlackClockDisplay = useCallback((): string | undefined => {
    return msToHHMMSS(usePlayStore.getState().blackTimeMs)
  }, [])

  return {
    handleBoardMove,
    cancelPremoveQueue,
    premoveQueue,
    premoveSnapToken,
    virtualBoardFen,
    startGame,
    resignGame,
    reviewGame,
    getWhiteClockDisplay,
    getBlackClockDisplay,
    botEngineReady,
  }
}
