import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  analysisBoardReset: vi.fn(),
  authRefresh: vi.fn(async () => {}),
  authReloadUser: vi.fn(async () => {}),
}))

vi.mock('./components/Board/ChessBoard', () => ({
  default: () => <div data-testid="chessboard" />,
}))

vi.mock('./components/Board/EvalBar', () => ({
  default: () => <div data-testid="evalbar" />,
}))

vi.mock('./components/Board/MoveRail', () => ({
  useIsPhone: () => false,
}))

vi.mock('./components/Board/EvalGraph', () => ({
  default: () => <div data-testid="evalgraph" />,
}))

vi.mock('./components/Board/GameReport', () => ({
  default: () => <div data-testid="gamereport" />,
}))

vi.mock('./components/Board/MoveList', () => ({
  default: () => <div data-testid="movelist" />,
}))

vi.mock('./components/Board/PlayerInfoBox', () => ({
  default: () => <div data-testid="playerinfo" />,
}))

vi.mock('./components/Import/ImportPanel', () => ({
  default: ({ onFenLoad }: { onFenLoad: (fen: string) => void }) => (
    <button onClick={() => onFenLoad('8/8/8/8/8/8/8/K6k w - - 0 1')}>
      Trigger FEN Load
    </button>
  ),
}))

vi.mock('./components/Import/AccountLink', () => ({
  default: () => <div data-testid="accountlink" />,
}))

vi.mock('./components/Import/GameSelector', () => ({
  default: () => <div data-testid="gameselector" />,
}))

vi.mock('./components/Layout/ResponsiveLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('./components/Profile/ProfilePage', () => ({
  default: ({
    onLoggedOut,
  }: {
    onLoggedOut?: () => void
  }) => (
    <div data-testid="profilepage">
      <button onClick={() => onLoggedOut?.()}>Mock Logout</button>
    </div>
  ),
}))

vi.mock('./components/Coach/MoveCoachComment', () => ({
  default: () => <div data-testid="coachcomment" />,
}))

vi.mock('./components/Play/BotPlayPage', () => ({
  default: () => <div data-testid="botplay" />,
}))

vi.mock('./components/ErrorBoundary', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('./components/AboutPage', () => ({
  default: () => <div data-testid="aboutpage" />,
}))

vi.mock('./components/PrivacyPage', () => ({
  default: () => <div data-testid="privacypage" />,
}))

vi.mock('./components/Auth/ResetPasswordPage', () => ({
  default: () => <div data-testid="resetpasswordpage" />,
}))

vi.mock('./components/AdBanner', () => ({
  default: () => <div data-testid="adbanner" />,
}))

vi.mock('./components/MobileAdBanner', () => ({
  default: () => <div data-testid="mobileadbanner" />,
}))

vi.mock('./components/Board/BestLines', () => ({
  default: () => <div data-testid="bestlines" />,
}))

vi.mock('./components/Analysis/EvalDisplay', () => ({
  default: () => <div data-testid="evaldisplay" />,
}))

vi.mock('./components/Board/gradeBadges', () => ({
  getGradeBadgeMeta: () => ({ className: 'badge', label: 'Label' }),
  renderGradeBadgeGlyph: () => null,
}))

vi.mock('./hooks/useGameReview', () => ({
  useGameReview: () => ({
    currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moves: [],
    moveTree: {},
    rootId: null,
    currentPath: [],
    currentMoveIndex: 0,
    pathDepth: 0,
    displayTotalDepth: 0,
    goToMove: vi.fn(),
    goForward: vi.fn(),
    goBack: vi.fn(),
    addVariationMove: vi.fn(),
    resetBranches: vi.fn(),
    lastAddedNodeIdRef: { current: null },
    nextMainLineNode: null,
    navigateTo: vi.fn(),
    hasVariations: false,
    rootBranchIds: [],
    isLoaded: false,
    whitePlayer: 'White',
    blackPlayer: 'Black',
    whiteElo: null,
    blackElo: null,
    totalMoves: 0,
    parseError: null,
    result: null,
    headers: {},
  }),
}))

vi.mock('./hooks/useAnalysisBoard', () => ({
  useAnalysisBoard: () => ({
    tree: {},
    rootId: null,
    currentPath: [],
    rootBranchIds: [],
    currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    mainLineSans: [],
    addMove: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    navigateTo: vi.fn(),
    resetBoard: mocks.analysisBoardReset,
    lastAddedNodeIdRef: { current: null },
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  }),
}))

vi.mock('./hooks/useCoaching', () => ({
  useCoaching: () => ({
    lessons: [],
    moveComments: [],
  }),
}))

vi.mock('./hooks/useStockfish', () => ({
  useStockfish: () => ({
    isReady: false,
    engineStatus: 'ready',
    runAnalysis: vi.fn(),
    cancelGameAnalysis: vi.fn(),
    analyzePositionLines: vi.fn(),
    analyzePositionSingleBranch: vi.fn(),
    stopPositionAnalysis: vi.fn(),
    stopBranchAnalysis: vi.fn(),
  }),
}))

vi.mock('./hooks/useSound', () => ({
  useSound: () => ({
    enabled: false,
    toggle: vi.fn(),
    playMoveSound: vi.fn(),
  }),
}))

vi.mock('./stores/authStore', () => ({
  useAuthStore: (selector: (state: {
    refresh: typeof mocks.authRefresh
    reloadUser: typeof mocks.authReloadUser
    user: null
    isPremium: false
  }) => unknown) => selector({
    refresh: mocks.authRefresh,
    reloadUser: mocks.authReloadUser,
    user: null,
    isPremium: false,
  }),
}))

vi.mock('./stores/playStore', () => ({
  clearPlaySession: vi.fn(),
}))

vi.mock('./engine/stockfish', () => ({
  evalResultToTopLines: vi.fn(() => []),
}))

vi.mock('./engine/analysis', () => ({
  classifyMove: vi.fn(() => 'good'),
  isSacrificeFn: vi.fn(() => false),
}))

vi.mock('./components/Import/normalizeGame', () => ({
  cacheRatingsFromGameList: vi.fn(),
  readCachedRatings: vi.fn(() => null),
}))

vi.mock('./services/monitoring', () => ({
  reportFrontendPerf: vi.fn(),
}))

import App from './App'
import { useGameStore } from './stores/gameStore'

describe('App FEN loading', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    useGameStore.getState().reset()
    mocks.analysisBoardReset.mockReset()
    mocks.authRefresh.mockClear()
    mocks.authReloadUser.mockClear()
    window.history.replaceState({}, '', '/')
  })

  it('switches to the analysis panel after loading a FEN', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'PGN' }))
    fireEvent.click(screen.getByRole('button', { name: 'Trigger FEN Load' }))

    expect(mocks.analysisBoardReset).toHaveBeenCalledWith('8/8/8/8/8/8/8/K6k w - - 0 1')
    expect(screen.getByText('Move pieces on the board to start an analysis.')).toBeInTheDocument()
  })

  it('renders settings for guests via the public settings route', () => {
    window.history.replaceState({}, '', '/settings')

    render(<App />)

    expect(screen.getByTestId('profilepage')).toBeInTheDocument()
  })

  it('returns to review after logging out from settings', () => {
    window.history.replaceState({}, '', '/settings')

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Mock Logout' }))

    expect(window.location.pathname).toBe('/')
    expect(screen.queryByTestId('profilepage')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PGN' })).toBeInTheDocument()
  })
})
