// useBotPlay.ts — Core game loop for Play vs Bot mode.
// Manages a dedicated StockfishEngine instance (3rd worker), move tree, and clocks.
// All persistent state lives in playStore; this hook owns the async lifecycle.
//
// PREMOVE ARCHITECTURE (2026-03-24 fix):
// Premoves are handled entirely inside this hook — NOT in ChessBoard's React render
// cycle. ChessBoard reports premove intent via onPremoveSet (orig/dest). After the
// bot move lands, scheduleBotMove checks the pendingPremoveRef and applies the user's
// premove synchronously before yielding to React. This eliminates the race condition
// caused by chessground's callUserFunction using setTimeout(..., 1) combined with
// extra React re-renders (browse snap-back, StrictMode double-fire) that could call
// api.set({fen}) and conflict with chessground's post-premove internal state.
//
// KEY INVARIANT: ChessBoard is told NOT to call playPremove() (via
// externalPremoveHandling=true). Instead, this hook applies premoves via chess.js
// and writes the result directly to the store. Chessground's premove visual is
// cleared by the subsequent api.set({fen}) that React triggers on re-render.

import { useEffect, useRef, useCallback, useState } from 'react'
import { Chess } from 'chess.js'
import { StockfishEngine } from '../engine/stockfish'
import { usePlayStore, STARTING_FEN, type PlayConfig, type TimeControl } from '../stores/playStore'
import { msToHHMMSS } from '../utils/format'
import { useGameStore } from '../stores/gameStore'
import { classifySan } from './useSound'
import type { MoveNode } from '../chess/types'

/** Movetime per time control — scales with game pace */
function getBotMovetime(tc: TimeControl): number {
  if (tc === '5+0') return 100
  if (tc === '10+0') return 300
  if (tc === '15+10') return 500
  return 300  // 'none' (untimed)
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
    }
  })

  return node
}

export function useBotPlay(onNavigateToReview: () => void) {
  const botEngineRef = useRef<StockfishEngine | null>(null)
  const clockRafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(0)
  const audioRefs = useRef<Partial<Record<string, HTMLAudioElement>>>({})
  const [botEngineReady, setBotEngineReady] = useState(false)

  // ── Premove queue ─────────────────────────────────────────────────────────
  // Stores the user's premove intent (orig, dest squares). Set by ChessBoard's
  // onPremoveSet callback. Consumed synchronously by scheduleBotMove after the
  // bot move lands — this avoids the setTimeout(1ms) race in chessground's
  // callUserFunction that can cause tree corruption when combined with React
  // re-renders resetting the board position mid-premove.
  const pendingPremoveRef = useRef<{ orig: string; dest: string } | null>(null)

  // ── Mutual exclusion guard ────────────────────────────────────────────────
  // Prevents concurrent execution of move processing. Guards against stale
  // chessground `after` callbacks arriving via setTimeout(1).
  const isProcessingMoveRef = useRef(false)

  const store = usePlayStore
  const gameStore = useGameStore

  // ── Engine lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    const engine = new StockfishEngine()
    botEngineRef.current = engine
    engine.initialize().then(() => {
      setBotEngineReady(true)
      // If we remounted while a game was in progress (e.g. tab switch),
      // re-trigger the bot if it was thinking
      const state = store.getState()
      if (state.status === 'playing' && state.isBotThinking) {
        store.getState().setIsBotThinking(false)
        scheduleBotMove(state.currentFen)
      }
    }).catch(console.error)

    return () => {
      cancelClockRaf()
      engine.terminate()
      botEngineRef.current = null
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clock RAF loop ───────────────────────────────────────────────────────
  function startClockRaf() {
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
  }

  function cancelClockRaf() {
    if (clockRafRef.current !== null) {
      cancelAnimationFrame(clockRafRef.current)
      clockRafRef.current = null
    }
  }

  // ── Sound helper ─────────────────────────────────────────────────────────
  function playSound(san: string) {
    if (localStorage.getItem('soundEnabled') === 'false') return
    const event = classifySan(san)
    const paths: Record<string, string> = {
      move:    '/sounds/move-self.mp3',
      capture: '/sounds/capture.mp3',
      castle:  '/sounds/castle.mp3',
      check:   '/sounds/move-check.mp3',
      mate:    '/sounds/game-end.mp3',
      promote: '/sounds/promote.mp3',
    }
    const path = paths[event] ?? paths.move
    if (!audioRefs.current[path]) {
      const audio = new Audio(path)
      audio.preload = 'auto'
      audioRefs.current[path] = audio
    }
    const audio = audioRefs.current[path]!
    audio.currentTime = 0
    audio.play().catch(() => {})
  }

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
    if (chess.isThreefoldRepetition()) {
      state.setResult('draw', 'threefold')
      return true
    }
    if (chess.isDraw()) {  // 50-move rule
      state.setResult('draw', 'fifty-move')
      return true
    }
    return false
  }

  // ── Try applying a pending premove ─────────────────────────────────────
  // Called synchronously after the bot move is committed to the store.
  // Validates the premove with chess.js against the post-bot-move FEN.
  // Returns the FEN after the premove if successful, or null if invalid.
  function tryApplyPremove(postBotFen: string): string | null {
    const premove = pendingPremoveRef.current
    if (!premove) return null

    // Clear the premove immediately — we consume it regardless of validity
    pendingPremoveRef.current = null

    const state = store.getState()
    if (state.status !== 'playing') return null

    // Validate with chess.js
    const chess = new Chess(postBotFen)
    let moveResult
    try {
      moveResult = chess.move({ from: premove.orig, to: premove.dest, promotion: 'q' })
    } catch {
      return null  // illegal premove for this position
    }
    if (!moveResult) return null

    const premoveFen = chess.fen()
    const premoveSan = moveResult.san

    // Read fresh state since the bot move setState just ran synchronously
    const freshState = store.getState()
    const moveColor = freshState.currentFen.split(' ')[1] === 'w' ? 'white' : 'black'

    // Sanity check: it should be the user's turn
    if (moveColor !== freshState.config!.userColor) return null

    isProcessingMoveRef.current = true
    applyMoveToStore(premove.orig, premove.dest, premoveSan, premoveFen, freshState)

    // Add increment to user's clock
    usePlayStore.getState().addIncrement(moveColor)

    playSound(premoveSan)
    isProcessingMoveRef.current = false

    return premoveFen
  }

  // ── Bot move ─────────────────────────────────────────────────────────────
  const scheduleBotMove = useCallback(async (fen: string) => {
    const state = store.getState()
    if (!botEngineRef.current || state.status !== 'playing') return

    state.setIsBotThinking(true)
    const botMoveStart = performance.now()

    // Re-check status (user may have resigned immediately)
    if (store.getState().status !== 'playing') {
      store.getState().setIsBotThinking(false)
      return
    }

    const config = store.getState().config!
    const movetime = getBotMovetime(config.timeControl)

    let uci: string
    try {
      uci = await botEngineRef.current.getBotMove(fen, config.botElo, movetime)
    } catch (e) {
      console.error('Bot move failed', e)
      store.getState().setIsBotThinking(false)
      return
    }

    // Pad to 1 second total bot move time
    const elapsed = performance.now() - botMoveStart
    const remaining = Math.max(0, 1000 - elapsed)
    if (remaining > 0) {
      await new Promise<void>(r => setTimeout(r, remaining))
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

    // Add increment to bot's clock after move
    usePlayStore.getState().addIncrement(moveColor)

    playSound(san)

    // Check terminal after bot move
    const chess3 = new Chess(botNewFen)
    if (checkTerminal(chess3)) return

    // ── Premove handling ──────────────────────────────────────────────────
    // Process any pending premove SYNCHRONOUSLY before yielding to React.
    // This runs in the same microtask as the bot move's setState, so by the
    // time React re-renders, the store already contains both the bot move
    // AND the user's premove. No setTimeout(1) race, no stale FEN refs.
    const premoveFen = tryApplyPremove(botNewFen)
    if (premoveFen) {
      // Check terminal after premove
      const chess4 = new Chess(premoveFen)
      if (checkTerminal(chess4)) return

      // The premove was applied — schedule the NEXT bot move
      await scheduleBotMove(premoveFen)
      return
    }

    // No premove — React will render the board with the bot's new FEN and
    // the user can make their move normally.

  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── User move handler ────────────────────────────────────────────────────
  const handleUserMove = useCallback(async (from: string, to: string, san: string, newFen: string) => {
    // Guard against stale chessground `after` callbacks arriving via setTimeout(1)
    // after we already processed the same move as a premove in scheduleBotMove.
    if (isProcessingMoveRef.current) return

    const state = store.getState()
    if (state.status !== 'playing' || state.isBotThinking) return

    const moveColor = state.currentFen.split(' ')[1] === 'w' ? 'white' : 'black'
    if (moveColor !== state.config!.userColor) return  // not user's turn

    // If the store already has this FEN as the current tip, the premove path
    // in scheduleBotMove already applied this move — skip the duplicate.
    const lastNodeId = state.currentPath[state.currentPath.length - 1]
    if (lastNodeId && state.tree[lastNodeId]?.fen === newFen) return

    isProcessingMoveRef.current = true

    applyMoveToStore(from, to, san, newFen, state)

    // Add increment to user's clock after move
    usePlayStore.getState().addIncrement(moveColor)

    playSound(san)

    isProcessingMoveRef.current = false

    // Clear any pending premove — the user made a regular move instead
    pendingPremoveRef.current = null

    // Check terminal
    const chess2 = new Chess(newFen)
    if (checkTerminal(chess2)) return

    // Schedule bot move
    await scheduleBotMove(newFen)
  }, [scheduleBotMove])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Premove set/unset callbacks for ChessBoard ─────────────────────────
  const handlePremoveSet = useCallback((orig: string | null, dest: string | null) => {
    if (orig && dest) {
      pendingPremoveRef.current = { orig, dest }
    } else {
      pendingPremoveRef.current = null
    }
  }, [])

  // ── Start game ───────────────────────────────────────────────────────────
  const startGame = useCallback((config: PlayConfig) => {
    cancelClockRaf()
    pendingPremoveRef.current = null
    isProcessingMoveRef.current = false
    store.getState().startGame(config)

    if (config.timeControl !== 'none') {
      startClockRaf()
    }

    // If user plays black, bot goes first
    if (config.userColor === 'black') {
      setTimeout(() => scheduleBotMove(STARTING_FEN), 100)
    }
  }, [scheduleBotMove])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resign ───────────────────────────────────────────────────────────────
  const resignGame = useCallback(() => {
    const state = store.getState()
    if (state.status !== 'playing') return
    pendingPremoveRef.current = null
    state.setResult('user-loss', 'resigned')
    cancelClockRaf()
  }, [])

  // ── Review game ──────────────────────────────────────────────────────────
  const reviewGame = useCallback(() => {
    const state = store.getState()
    if (!state.rootId || !state.config) return

    const displayName = 'You'
    const pgn = generatePgn(state.tree, state.rootId, state.config, state.result, displayName)

    const gs = gameStore.getState()
    gs.setPgn(pgn)
    gs.setUserColor(state.config.userColor)
    gs.setPlatform(null)

    onNavigateToReview()
  }, [onNavigateToReview])

  // ── Clock display helpers (exported for BotPlayPage) ─────────────────────
  const getWhiteClockDisplay = useCallback((): string | undefined => {
    return msToHHMMSS(usePlayStore.getState().whiteTimeMs)
  }, [])

  const getBlackClockDisplay = useCallback((): string | undefined => {
    return msToHHMMSS(usePlayStore.getState().blackTimeMs)
  }, [])

  return {
    handleUserMove,
    handlePremoveSet,
    startGame,
    resignGame,
    reviewGame,
    getWhiteClockDisplay,
    getBlackClockDisplay,
    botEngineReady,
  }
}
