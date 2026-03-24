// useBotPlay.ts — Core game loop for Play vs Bot mode.
// Manages a dedicated StockfishEngine instance (3rd worker), move tree, and clocks.
// All persistent state lives in playStore; this hook owns the async lifecycle.

import { useEffect, useRef, useCallback, useState } from 'react'
import { Chess } from 'chess.js'
import { StockfishEngine } from '../engine/stockfish'
import { usePlayStore, STARTING_FEN, type PlayConfig, type TimeControl } from '../stores/playStore'
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

function msToHHMMSS(ms: number | null): string | undefined {
  if (ms === null) return undefined
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
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
  let firstBlackMove = nodes.length > 0 && nodes[0].color === 'black'
  if (firstBlackMove) parts.push('1...')

  nodes.forEach((node) => {
    if (node.color === 'white') parts.push(`${node.moveNumber}.`)
    parts.push(node.san)
  })
  parts.push(resultStr)

  return `${header}\n\n${parts.join(' ')}`
}

export function useBotPlay(onNavigateToReview: () => void) {
  const botEngineRef = useRef<StockfishEngine | null>(null)
  const clockRafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(0)
  const audioRefs = useRef<Partial<Record<string, HTMLAudioElement>>>({})
  const [botEngineReady, setBotEngineReady] = useState(false)

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

    const newFen = chess.fen()
    const san = moveResult.san

    // Build MoveNode
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
      fen: newFen,
      childIds: [],
      parentId,
      moveNumber: moveNum,
      color: moveColor,
      isMainLine: true,
    }

    // Update store in one atomic batch so React renders once with fully consistent state.
    // This is critical for premove reliability: chessground must see currentFen + isBotThinking=false
    // in the same render, otherwise it gets conflicting movable.color signals across renders.
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
        isBotThinking: false,
      }
    })

    // Add increment to bot's clock after move (separate — clock update doesn't affect premove)
    usePlayStore.getState().addIncrement(moveColor)

    // Stop bot clock, start user clock
    // (clockRunning stays true — the RAF loop ticks whichever side's turn it is)

    playSound(san)

    // Check terminal
    const chess3 = new Chess(newFen)
    if (checkTerminal(chess3)) return

  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── User move handler ────────────────────────────────────────────────────
  const handleUserMove = useCallback(async (from: string, to: string, san: string, newFen: string) => {
    const state = store.getState()
    if (state.status !== 'playing' || state.isBotThinking) return

    const moveColor = state.currentFen.split(' ')[1] === 'w' ? 'white' : 'black'
    if (moveColor !== state.config!.userColor) return  // not user's turn

    // Build MoveNode
    const counter = state.moveCounter + 1
    const nodeId = `p${counter}`
    const parentId = state.currentPath[state.currentPath.length - 1] ?? null
    const chess = new Chess(state.currentFen)
    const moveNum = parseInt(state.currentFen.split(' ')[5] ?? '1', 10)

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
    void chess  // parse for future use if needed

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

    // Add increment to user's clock after move
    usePlayStore.getState().addIncrement(moveColor)

    playSound(san)

    // Check terminal
    const chess2 = new Chess(newFen)
    if (checkTerminal(chess2)) return

    // Schedule bot move
    await scheduleBotMove(newFen)
  }, [scheduleBotMove])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start game ───────────────────────────────────────────────────────────
  const startGame = useCallback((config: PlayConfig) => {
    cancelClockRaf()
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
    startGame,
    resignGame,
    reviewGame,
    getWhiteClockDisplay,
    getBlackClockDisplay,
    botEngineReady,
  }
}
