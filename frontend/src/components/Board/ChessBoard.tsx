// ChessBoard.tsx — Interactive chess board using chessground + chess.js
// chessground handles rendering and drag/drop
// chess.js handles legal move computation

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { Chessground } from 'chessground'
import type { Api } from 'chessground/api'
import type { Config } from 'chessground/config'
import type { Key } from 'chessground/types'
import type { DrawShape } from 'chessground/draw'
import { Chess } from 'chess.js'
import { STARTING_FEN } from '../../chess/constants'
import { PIECE_IMAGES } from '../../chess/pieceImages'

export type { DrawShape }


export interface ChessBoardProps {
  fen?: string
  orientation?: 'white' | 'black'
  interactive?: boolean
  onMove?: (from: string, to: string, san: string, fen: string) => void
  onIllegalMove?: () => void
  shapes?: DrawShape[]
  lastMove?: [Key, Key]
  pathKey?: number  // Changes whenever position navigates; ensures FEN sync always fires
  forceCheck?: 'white' | 'black'   // Force king highlight (e.g. on resign, even without check)
  userPerspective?: 'white' | 'black'  // When set, keeps movable.color + turnColor on this color
                                        // regardless of whose turn the FEN says it is. Used for
                                        // premove queueing: the virtual FEN may have the opponent to
                                        // move, but the user must still be able to drag their pieces.
  premoveQueue?: Array<{ orig: string; dest: string }> // Highlight orig+dest squares for queued premoves
}


/** Compute legal move destinations for chessground's movable.dests */
export function getLegalDests(fen: string): Map<Key, Key[]> {
  const chess = new Chess(fen)
  const dests = new Map<Key, Key[]>()
  chess.moves({ verbose: true }).forEach(m => {
    const from = m.from as Key
    if (!dests.has(from)) dests.set(from, [])
    dests.get(from)!.push(m.to as Key)
  })
  return dests
}

/** Get which color's turn it is from a FEN */
export function getTurnColor(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'w' ? 'white' : 'black'
}

/** Convert board array coordinates to chessground Key.
 *  chess.board() returns board[rank][file] where rank 0 = row 8, file 0 = 'a'. */
function fileRankToKey(f: number, r: number): Key {
  return (String.fromCharCode(97 + f) + (8 - r)) as Key
}

interface OverlayMetrics {
  left: number
  top: number
  cellWidth: number
  cellHeight: number
}

function getSquarePosition(
  square: Key,
  orientation: 'white' | 'black',
  metrics: OverlayMetrics | null,
): React.CSSProperties {
  const file = square.charCodeAt(0) - 97
  const rank = parseInt(square[1], 10) - 1
  const leftCell = orientation === 'white' ? file : (7 - file)
  const topCell = orientation === 'white' ? (7 - rank) : rank

  if (metrics) {
    return {
      left: `${metrics.left + leftCell * metrics.cellWidth}px`,
      top: `${metrics.top + topCell * metrics.cellHeight}px`,
      width: `${metrics.cellWidth}px`,
      height: `${metrics.cellHeight}px`,
    }
  }

  return {
    left: `${leftCell * 12.5}%`,
    top: `${topCell * 12.5}%`,
    width: '12.5%',
    height: '12.5%',
  }
}

function getEventPosition(event: PointerEvent | MouseEvent | TouchEvent): [number, number] | null {
  if ('touches' in event) {
    const touch = event.touches[0] ?? event.changedTouches[0]
    return touch ? [touch.clientX, touch.clientY] : null
  }
  return [event.clientX, event.clientY]
}

/** Apply a premove without legality checks (pinned pieces, check, etc.).
 *  Uses chess.js put/remove rather than move(), so legality is not validated.
 *  The premove may become legal when it fires; if still illegal, drainPremoveQueue
 *  clears the queue (Chess.com behaviour). */
export function applyPremoveForcefully(
  fen: string,
  userFenColor: 'w' | 'b',
  from: string,
  to: string,
): string {
  try {
    const parts = fen.split(' ')
    parts[1] = userFenColor
    parts[3] = '-'
    const chess = new Chess(parts.join(' '))
    const piece = chess.get(from as any)
    if (!piece) return fen
    chess.remove(from as any)
    chess.remove(to as any)                 // capture any piece at dest
    const isPromo = piece.type === 'p' && (to[1] === '8' || to[1] === '1')
    chess.put(isPromo ? { type: 'q' as any, color: piece.color } : piece, to as any)
    const newParts = chess.fen().split(' ')
    newParts[1] = userFenColor === 'w' ? 'b' : 'w'   // toggle turn
    newParts[3] = '-'
    return newParts.join(' ')
  } catch {
    return fen  // ultimate fallback — unchanged position
  }
}

/** Compute all geometrically valid premove destinations for the user's pieces.
 *  Fully permissive: every square a piece could possibly reach is highlighted,
 *  regardless of what currently occupies it (own pieces, opponent pieces, blocked
 *  rays). If the premove is still illegal when it fires, drainPremoveQueue clears
 *  the queue — same as Chess.com / Lichess behaviour. */
function getPremoveDests(fen: string, perspective: 'white' | 'black'): Map<Key, Key[]> {
  const chess = new Chess(fen)
  const board = chess.board()
  const uc = perspective === 'white' ? 'w' : 'b'
  const dests = new Map<Key, Key[]>()

  /** True if square (f,r) is on the board */
  const inBounds = (f: number, r: number) => f >= 0 && f <= 7 && r >= 0 && r <= 7

  /** Push all squares along a ray to the board edge, ignoring any pieces in the way.
   *  The premove may become legal when it fires (blocking piece may have moved). */
  function addRay(targets: Key[], f: number, r: number, df: number, dr: number) {
    let cf = f + df, cr = r + dr
    while (cf >= 0 && cf <= 7 && cr >= 0 && cr <= 7) {
      targets.push(fileRankToKey(cf, cr))
      cf += df; cr += dr
    }
  }

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f]
      if (!p || p.color !== uc) continue

      const targets: Key[] = []
      const fwd = uc === 'w' ? -1 : 1      // white moves up (rank decreases), black moves down
      const startRank = uc === 'w' ? 6 : 1 // rank index: white starts at r=6 (row '2'), black at r=1 (row '7')

      switch (p.type) {
        case 'p':
          if (inBounds(f, r + fwd))                        targets.push(fileRankToKey(f, r + fwd))
          if (r === startRank && inBounds(f, r + fwd * 2)) targets.push(fileRankToKey(f, r + fwd * 2))
          if (inBounds(f - 1, r + fwd))                    targets.push(fileRankToKey(f - 1, r + fwd))
          if (inBounds(f + 1, r + fwd))                    targets.push(fileRankToKey(f + 1, r + fwd))
          break
        case 'r':
          [[-1,0],[1,0],[0,-1],[0,1]].forEach(([df,dr]) => addRay(targets, f, r, df, dr))
          break
        case 'b':
          [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([df,dr]) => addRay(targets, f, r, df, dr))
          break
        case 'q':
          [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([df,dr]) => addRay(targets, f, r, df, dr))
          break
        case 'n':
          [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]
            .forEach(([df,dr]) => { if (inBounds(f+df, r+dr)) targets.push(fileRankToKey(f+df, r+dr)) })
          break
        case 'k':
          [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
            .forEach(([df,dr]) => { if (inBounds(f+df, r+dr)) targets.push(fileRankToKey(f+df, r+dr)) })
          // Castling premoves: king on starting square + right present in FEN.
          // No path-clear check — pieces in the way may move before the premove fires.
          {
            const castling = fen.split(' ')[2] ?? '-'
            if (uc === 'w' && r === 7 && f === 4) {
              if (castling.includes('K')) targets.push(fileRankToKey(6, 7))  // g1 kingside
              if (castling.includes('Q')) targets.push(fileRankToKey(2, 7))  // c1 queenside
            } else if (uc === 'b' && r === 0 && f === 4) {
              if (castling.includes('k')) targets.push(fileRankToKey(6, 0))  // g8 kingside
              if (castling.includes('q')) targets.push(fileRankToKey(2, 0))  // c8 queenside
            }
          }
          break
      }
      if (targets.length) dests.set(fileRankToKey(f, r), targets)
    }
  }
  return dests
}


export default function ChessBoard({
  fen = STARTING_FEN,
  orientation = 'white',
  interactive = true,
  onMove,
  shapes = [],
  lastMove,
  pathKey = 0,
  forceCheck,
  userPerspective,
  onIllegalMove,
  premoveQueue,
}: ChessBoardProps) {
  // Compute check highlight + legal move destinations + turn color.
  // When userPerspective is set (premove queueing mode), compute legal dests
  // from a turn-flipped FEN so the user can always drag their own pieces,
  // even when the virtual FEN technically says it's the opponent's turn.
  const { checkColor, legalDests, turnColor: fenTurnColor } = useMemo(() => {
    // Premove mode: use geometrically valid premove dests (pawn diagonals always, captures allowed).
    if (userPerspective && !interactive) {
      return {
        checkColor: false as const,
        legalDests: getPremoveDests(fen, userPerspective),
        turnColor: userPerspective,
      }
    }
    // Regular mode: strict chess.js legal moves.
    try {
      const chess = new Chess(fen)
      const inCheck = chess.inCheck()
      const dests = new Map<Key, Key[]>()
      chess.moves({ verbose: true }).forEach(m => {
        const from = m.from as Key
        if (!dests.has(from)) dests.set(from, [])
        dests.get(from)!.push(m.to as Key)
      })
      const turn = chess.turn() === 'w' ? 'white' : 'black'
      return {
        checkColor: inCheck ? turn as 'white' | 'black' | false : false as 'white' | 'black' | false,
        legalDests: dests,
        turnColor: turn as 'white' | 'black',
      }
    } catch {
      return {
        checkColor: false as 'white' | 'black' | false,
        legalDests: new Map<Key, Key[]>(),
        turnColor: (fen.split(' ')[1] === 'w' ? 'white' : 'black') as 'white' | 'black',
      }
    }
  }, [fen, userPerspective, interactive])

  const [pendingPromotion, setPendingPromotion] = useState<{ from: Key; to: Key; color: 'white' | 'black'; orientation: 'white' | 'black' } | null>(null)
  const [boardReady, setBoardReady] = useState(false)
  const [isCoarsePointer, setIsCoarsePointer] = useState(false)
  const [dragPreviewSquare, setDragPreviewSquare] = useState<Key | null>(null)
  const [dragOriginSquare, setDragOriginSquare] = useState<Key | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [overlayMetrics, setOverlayMetrics] = useState<OverlayMetrics | null>(null)

  const orientationRef = useRef(orientation)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<Api | null>(null)
  const fenRef = useRef(fen)
  const onMoveRef = useRef(onMove)
  const interactiveRef = useRef(interactive)
  const userPerspectiveRef = useRef(userPerspective)
  const prevPathKeyRef = useRef(pathKey)
  const sizeRef = useRef({ width: 0, height: 0 })
  const isPinchZoomingRef = useRef(false)
  const isDraggingRef = useRef(false)
  const pendingResizeSyncRef = useRef(false)
  const pendingAutoShapesRef = useRef<DrawShape[] | null>(null)
  const userDrawableShapesRef = useRef<DrawShape[]>([])
  const userSquareHighlightsRef = useRef<Map<Key, string>>(new Map())
  const annotationPositionRef = useRef({ fen, pathKey })

  const syncManualAnnotations = useCallback(() => {
    apiRef.current?.set({
      drawable: { shapes: userDrawableShapesRef.current },
      highlight: { custom: userSquareHighlightsRef.current },
    })
  }, [])

  const syncOverlayMetrics = useCallback(() => {
    const api = apiRef.current
    const wrapperEl = wrapperRef.current
    const bounds = api?.state?.dom?.bounds
    if (!api || !wrapperEl || typeof bounds !== 'function') return

    const wrapperRect = wrapperEl.getBoundingClientRect()
    const boardRect = bounds()
    if (boardRect.width <= 0 || boardRect.height <= 0) return

    setOverlayMetrics(prev => {
      const next = {
        left: boardRect.left - wrapperRect.left,
        top: boardRect.top - wrapperRect.top,
        cellWidth: boardRect.width / 8,
        cellHeight: boardRect.height / 8,
      }

      if (
        prev &&
        Math.abs(prev.left - next.left) < 0.25 &&
        Math.abs(prev.top - next.top) < 0.25 &&
        Math.abs(prev.cellWidth - next.cellWidth) < 0.25 &&
        Math.abs(prev.cellHeight - next.cellHeight) < 0.25
      ) {
        return prev
      }

      return next
    })
  }, [])

  const flushBoardLayout = useCallback(() => {
    requestAnimationFrame(() => {
      apiRef.current?.redrawAll()
      syncOverlayMetrics()
    })
  }, [syncOverlayMetrics])

  const flushPendingDrawableShapes = useCallback(() => {
    if (isPinchZoomingRef.current || isDraggingRef.current) return
    if (!apiRef.current || !pendingAutoShapesRef.current) return
    apiRef.current.set({
      drawable: { autoShapes: pendingAutoShapesRef.current },
    })
    pendingAutoShapesRef.current = null
  }, [])

  const flushPendingLayoutSync = useCallback(() => {
    if (isPinchZoomingRef.current || isDraggingRef.current) return
    if (!pendingResizeSyncRef.current) return
    pendingResizeSyncRef.current = false
    flushBoardLayout()
  }, [flushBoardLayout])

  const clearDragPreview = useCallback(() => {
    isDraggingRef.current = false
    setIsDragging(false)
    setDragOriginSquare(null)
    setDragPreviewSquare(null)
    flushPendingDrawableShapes()
    flushPendingLayoutSync()
  }, [flushPendingDrawableShapes, flushPendingLayoutSync])

  // Track when the board has a real layout size so shapes only sync after mount.
  // Avoid writing inline width/height here: that can leave the board "stuck" at a
  // stale pixel size after the window is resized down and then back up.
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width <= 0 || height <= 0) return

      const widthChanged = Math.abs(width - sizeRef.current.width) > 0.5
      const heightChanged = Math.abs(height - sizeRef.current.height) > 0.5

      if (!widthChanged && !heightChanged) return

      sizeRef.current = { width, height }
      setBoardReady(true)
      if (isPinchZoomingRef.current || isDraggingRef.current) {
        pendingResizeSyncRef.current = true
        return
      }
      flushBoardLayout()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [flushBoardLayout])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const mediaQuery = window.matchMedia('(pointer: coarse)')
    const syncPointerMode = () => setIsCoarsePointer(mediaQuery.matches)

    syncPointerMode()
    mediaQuery.addEventListener('change', syncPointerMode)
    return () => mediaQuery.removeEventListener('change', syncPointerMode)
  }, [])

  // Keep refs current without triggering re-init
  fenRef.current = fen
  onMoveRef.current = onMove
  interactiveRef.current = interactive
  userPerspectiveRef.current = userPerspective
  orientationRef.current = orientation

  // Initialize chessground once on mount
  useEffect(() => {
    if (!containerRef.current) return

    const config: Config = {
      fen,
      orientation,
      turnColor: getTurnColor(fen),
      movable: {
        color: interactive ? getTurnColor(fen) : undefined,
        free: false,
        dests: interactive ? getLegalDests(fen) : undefined,
        showDests: true,
        events: {
          after: (from: Key, to: Key) => {
            const currentFen = fenRef.current
            const isInteractive = interactiveRef.current
            const perspective = userPerspectiveRef.current

            // Non-interactive but userPerspective set: user is queuing a premove.
            // Pass the move directly to the parent — no chess.js validation needed here
            // (the parent's handleBoardMove appends to the queue without validating).
            // Promotion: auto-queen for premoves.
            if (!isInteractive && perspective) {
              // User is queueing a premove. Forward to parent (handleBoardMove appends to queue).
              onMoveRef.current?.(from, to, '', '')

              // Compute the new virtual FEN for this premove.
              // We force the user's turn in the FEN (currentFen has opponent to move in premove mode).
              // Also update fenRef immediately so the NEXT rapid premove's `after` callback
              // gets the correct starting FEN — React batches state updates and may not re-render
              // until all queued premoves are already done.
              const userFenColor = perspective === 'white' ? 'w' : 'b'
              let newVirtualFen = currentFen
              try {
                const parts = currentFen.split(' ')
                parts[1] = userFenColor
                parts[3] = '-'
                const tmpChess = new Chess(parts.join(' '))
                tmpChess.move({ from, to, promotion: 'q' })
                newVirtualFen = tmpChess.fen()
              } catch {
                // Legal move failed (e.g. pinned piece). Force-apply for display — the premove
                // may become legal when it fires. If still illegal, drainPremoveQueue clears it.
                newVirtualFen = applyPremoveForcefully(currentFen, userFenColor, from, to)
              }

              fenRef.current = newVirtualFen  // keep next after callback in sync before re-render

              try {
                const dests = getPremoveDests(newVirtualFen, perspective)
                apiRef.current?.set({
                  // No fen — drag already placed the piece correctly in chessground's internal
                  // state. Setting fen here diffs against the stored pre-drag FEN and causes
                  // chessground to re-animate the piece (snap-back effect). The FEN sync
                  // useEffect handles the official update after React re-renders; piece
                  // positions already match virtualBoardFen so no animation occurs then either.
                  turnColor: perspective,
                  movable: { color: perspective, dests },
                })
              } catch { /* useEffect catches up on next render */ }
              return
            }

            // Interactive (real move): validate with chess.js
            const chess = new Chess(currentFen)
            const piece = chess.get(from as any)
            const toRank = to[1]

            // Detect promotion: show picker for real moves
            if (piece?.type === 'p' && (toRank === '8' || toRank === '1')) {
              const color = piece.color === 'w' ? 'white' : 'black'
              setPendingPromotion({ from, to, color, orientation: orientationRef.current })
              return
            }

            const move = chess.move({ from, to })
            if (move && onMoveRef.current) {
              onMoveRef.current(from, to, move.san, chess.fen())
            } else {
              // Move failed validation — snap back and re-enable the board.
              onIllegalMove?.()
              apiRef.current?.set({
                fen: currentFen,
                drawable: { shapes: [] },
                highlight: { custom: new Map() },
                turnColor: getTurnColor(currentFen),
                movable: {
                  color: interactiveRef.current ? getTurnColor(currentFen) : undefined,
                  dests: interactiveRef.current ? getLegalDests(currentFen) : undefined,
                },
              })
            }
          },
        },
      },
      highlight: {
        lastMove: true,
        check: true,
      },
      animation: {
        enabled: true,
        duration: 220,
      },
      draggable: {
        enabled: interactive || !!userPerspective,
        showGhost: true,
        distance: 0,
        autoDistance: true,
      },
      premovable: {
        // Disabled — we handle premoves via virtual FEN in useBotPlay.
        // Chessground's built-in premove would conflict with our queue approach.
        enabled: false,
      },
      drawable: {
        enabled: true,
        visible: true,
        defaultSnapToValidMove: false,
        eraseOnClick: true,
        shapes: [],
        autoShapes: [],
        brushes: {
          // Chessground's default right-drag brush is "green"; tint it yellow so
          // user-drawn arrows are distinct from the green engine suggestion arrows.
          green:    { key: 'green',    color: '#efc11a', opacity: 0.92, lineWidth: 10 },
          red:      { key: 'red',      color: '#a63232', opacity: 0.9,  lineWidth: 10 },
          blue:     { key: 'blue',     color: '#003088', opacity: 0.8,  lineWidth: 10 },
          yellow:   { key: 'yellow',   color: '#efc11a', opacity: 0.92, lineWidth: 10 },
          bestMove: { key: 'bestMove', color: '#15781B', opacity: 0.95, lineWidth: 10 },
          goodMove: { key: 'goodMove', color: '#15781B', opacity: 0.70, lineWidth: 6 },
          okMove:   { key: 'okMove',   color: '#15781B', opacity: 0.50, lineWidth: 3.5 },
        },
        onChange: nextShapes => {
          const nextSquareHighlights = new Map<Key, string>()
          nextShapes.forEach(shape => {
            if (!shape.dest) {
              nextSquareHighlights.set(shape.orig as Key, 'manual-red')
            }
          })
          userDrawableShapesRef.current = nextShapes
          userSquareHighlightsRef.current = nextSquareHighlights
          syncManualAnnotations()
        },
      },
    }

    apiRef.current = Chessground(containerRef.current, config)
    flushBoardLayout()

    return () => {
      apiRef.current?.destroy()
      apiRef.current = null
    }
  }, [flushBoardLayout]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync FEN, orientation, and last-move highlight after init.
  // Explicitly passing lastMove on every navigation ensures the highlight
  // always matches the current position (prevents stale highlight after goBack).
  // When userPerspective is set, keep movable.color on the user's color so they
  // can always drag their own pieces (even when virtual FEN says opponent's turn).
  useEffect(() => {
    fenRef.current = fen
    if (!apiRef.current) return

    const positionChanged =
      annotationPositionRef.current.fen !== fen ||
      annotationPositionRef.current.pathKey !== pathKey
    annotationPositionRef.current = { fen, pathKey }

    if (positionChanged) {
      userDrawableShapesRef.current = []
      userSquareHighlightsRef.current = new Map()
    }

    const pathKeyChanged = prevPathKeyRef.current !== pathKey
    prevPathKeyRef.current = pathKey

    if (pathKeyChanged) {
      apiRef.current.cancelMove() // Cancel any ongoing move interaction when navigation changes
    }

    const canInteract = interactive || !!userPerspective
    apiRef.current.set({
      fen,
      drawable: { shapes: userDrawableShapesRef.current },
      highlight: { custom: userSquareHighlightsRef.current },
      lastMove: lastMove ?? [],
      orientation,
      check: forceCheck ?? checkColor,
      turnColor: fenTurnColor,
      movable: {
        color: canInteract ? fenTurnColor : undefined,
        dests: canInteract ? legalDests : undefined,
      },
      draggable: { enabled: canInteract },
    })
    requestAnimationFrame(syncOverlayMetrics)
  }, [fen, lastMove, orientation, interactive, pathKey, checkColor, fenTurnColor, legalDests, forceCheck, userPerspective, syncOverlayMetrics])

  // Sync engine arrow shapes — always re-pass movable so chessground's partial
  // set() can never accidentally clear movable.dests during an arrows update.
  // boardReady is included so that if shapes arrive before the board has laid out
  // (width === 0), this effect re-runs once the ResizeObserver reports a real size.
  const occupiedSquares = useMemo(() => {
    const occupied = new Set<Key>()
    try {
      const chess = new Chess(fen)
      const board = chess.board()
      for (let rank = 0; rank < 8; rank += 1) {
        for (let file = 0; file < 8; file += 1) {
          if (board[rank][file]) {
            occupied.add(fileRankToKey(file, rank))
          }
        }
      }
    } catch {
      // Ignore malformed FEN; drag overlays simply won't render occupied-capture rings.
    }
    return occupied
  }, [fen])

  const dragDestinationSquares = useMemo(() => {
    if (!isDragging || !dragOriginSquare) return []
    return legalDests.get(dragOriginSquare) ?? []
  }, [dragOriginSquare, isDragging, legalDests])

  useEffect(() => {
    if (!apiRef.current) return
    if (!containerRef.current || containerRef.current.getBoundingClientRect().width === 0) return

    // Premove highlight shapes — one filled rect per orig+dest square of each queued premove.
    // Using autoShapes+customSvg so highlights are pixel-perfect with the board squares
    // (chessground floors cg-container to 8/DPR px multiples; a DOM overlay would be off).
    const premoveShapes: DrawShape[] = []
    if (premoveQueue && premoveQueue.length > 0) {
      const svgRect = '<rect x="2" y="2" width="96" height="96" fill="rgba(20,30,85,0.15)" stroke="rgba(20,30,85,0.7)" stroke-width="4"/>'
      for (const pm of premoveQueue) {
        premoveShapes.push({ orig: pm.orig as Key, customSvg: { html: svgRect } })
        premoveShapes.push({ orig: pm.dest as Key, customSvg: { html: svgRect } })
      }
    }

    const autoShapes = [...premoveShapes, ...shapes]

    if (isPinchZoomingRef.current || isDraggingRef.current) {
      pendingAutoShapesRef.current = autoShapes
      return
    }

    apiRef.current.set({
      drawable: { autoShapes },
    })
  }, [shapes, boardReady, premoveQueue])

  useEffect(() => {
    const syncDragPreview = (event: PointerEvent) => {
      const api = apiRef.current
      if (!api) return
      if (isPinchZoomingRef.current) {
        clearDragPreview()
        return
      }

      const currentDrag = api.state.draggable.current
      if (!currentDrag?.started) {
        clearDragPreview()
        return
      }

      isDraggingRef.current = true
      setIsDragging(true)
      setDragOriginSquare(prev => (prev === currentDrag.orig ? prev : currentDrag.orig))

      const position = getEventPosition(event)
      if (!position) {
        setDragPreviewSquare(null)
        return
      }

      const hovered = api.getKeyAtDomPos(position)
      const nextSquare = hovered ?? null

      setDragPreviewSquare(prev => (prev === nextSquare ? prev : nextSquare))
    }

    window.addEventListener('pointermove', syncDragPreview)
    window.addEventListener('pointerup', clearDragPreview)
    window.addEventListener('pointercancel', clearDragPreview)

    return () => {
      window.removeEventListener('pointermove', syncDragPreview)
      window.removeEventListener('pointerup', clearDragPreview)
      window.removeEventListener('pointercancel', clearDragPreview)
    }
  }, [clearDragPreview])

  useEffect(() => {
    if (!isCoarsePointer) return

    const startPinchZoom = () => {
      if (isPinchZoomingRef.current) return
      isPinchZoomingRef.current = true
      pendingResizeSyncRef.current = true
      apiRef.current?.cancelMove()
      clearDragPreview()
    }

    const maybeFinishPinchZoom = (event: TouchEvent) => {
      if (event.touches.length > 1) return
      if (!isPinchZoomingRef.current) return
      isPinchZoomingRef.current = false
      flushPendingLayoutSync()
    }

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length > 1) startPinchZoom()
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 1) startPinchZoom()
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', maybeFinishPinchZoom, { passive: true })
    window.addEventListener('touchcancel', maybeFinishPinchZoom, { passive: true })

    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', maybeFinishPinchZoom)
      window.removeEventListener('touchcancel', maybeFinishPinchZoom)
    }
  }, [clearDragPreview, flushPendingLayoutSync, isCoarsePointer])

  useEffect(() => {
    const wrapEl = containerRef.current
    if (!wrapEl) return
    const canShowPieceCursor = (interactive || !!userPerspective) && !isDragging
    if (canShowPieceCursor) {
      wrapEl.setAttribute('data-cursor-color', fenTurnColor)
    } else {
      wrapEl.removeAttribute('data-cursor-color')
    }
    return () => wrapEl.removeAttribute('data-cursor-color')
  }, [interactive, userPerspective, isDragging, fenTurnColor, fen, orientation, pathKey])

  useEffect(() => {
    setIsDragging(false)
    setDragOriginSquare(null)
    setDragPreviewSquare(null)
  }, [fen, orientation, pathKey])

  const handlePromotion = useCallback((piece: string) => {
    if (!pendingPromotion) return
    const { from, to } = pendingPromotion
    const currentFen = fenRef.current
    const chess = new Chess(currentFen)
    const move = chess.move({ from, to, promotion: piece })
    setPendingPromotion(null)
    if (move && onMoveRef.current) {
      onMoveRef.current(from, to, move.san, chess.fen())
    } else {
      // Snap back on failure
      apiRef.current?.set({
        fen: currentFen,
        drawable: { shapes: [] },
        highlight: { custom: new Map() },
        turnColor: getTurnColor(currentFen),
        movable: {
          color: interactiveRef.current ? getTurnColor(currentFen) : undefined,
          dests: interactiveRef.current ? getLegalDests(currentFen) : undefined,
        },
      })
    }
  }, [pendingPromotion])

  return (
    <div
      ref={wrapperRef}
      className={`chess-board-container${isDragging ? ' board-dragging' : ''}`}
      role="region"
      aria-label="Chess board"
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {dragDestinationSquares.map(square => (
        <div
          key={`drag-dest-${square}`}
          className={`board-drag-move-dest${occupiedSquares.has(square) ? ' board-drag-move-dest--occupied' : ''}`}
          style={getSquarePosition(square, orientation, overlayMetrics)}
        />
      ))}
      {dragPreviewSquare && (
        <>
          {!isCoarsePointer && (
            <div
              className="board-hover-outline"
              style={getSquarePosition(dragPreviewSquare, orientation, overlayMetrics)}
            />
          )}
          <div
            className={`board-drag-target${occupiedSquares.has(dragPreviewSquare) ? ' board-drag-target--occupied' : ''}`}
            style={getSquarePosition(dragPreviewSquare, orientation, overlayMetrics)}
          />
        </>
      )}
      {pendingPromotion && (() => {
        const { to, color, orientation: ori } = pendingPromotion
        const fileIndex = to.charCodeAt(0) - 97
        const col = ori === 'white' ? fileIndex : 7 - fileIndex
        const leftPct = col * 12.5
        const isRank8 = to[1] === '8'
        const atVisualTop = (ori === 'white') === isRank8
        const pickerStyle: React.CSSProperties = {
          left: `${leftPct}%`,
          ...(atVisualTop ? { top: 0 } : { bottom: 0 }),
          flexDirection: atVisualTop ? 'column' : 'column-reverse',
        }
        const colorChar = color === 'white' ? 'w' : 'b'
        const pieces: [string, string][] = [['q','Queen'],['r','Rook'],['b','Bishop'],['n','Knight']]
        const cancelBtn = (
          <button
            key="cancel"
            className="promotion-cancel"
            onClick={() => {
              setPendingPromotion(null)
              const currentFen = fenRef.current
              apiRef.current?.set({
                fen: currentFen,
                turnColor: getTurnColor(currentFen),
                movable: {
                  color: interactiveRef.current ? getTurnColor(currentFen) : undefined,
                  dests: interactiveRef.current ? getLegalDests(currentFen) : undefined,
                },
              })
            }}
            title="Cancel"
          >✕</button>
        )
        const choiceBtns = pieces.map(([piece, label]) => (
          <button
            key={piece}
            className="promotion-choice"
            onClick={() => handlePromotion(piece)}
            title={label}
          >
            <img src={PIECE_IMAGES[`${colorChar}${piece}`]} alt={label} style={{ width: '85%', height: '85%' }} />
          </button>
        ))
        return (
          <div className="promotion-overlay">
            <div className="promotion-picker" style={pickerStyle}>
              {atVisualTop ? [cancelBtn, ...choiceBtns] : [...choiceBtns, cancelBtn]}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
