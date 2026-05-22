import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AccountAnalysisPage from './AccountAnalysisPage'
import { useAuthStore } from '../../stores/authStore'
import { useGameStore } from '../../stores/gameStore'

const apiMocks = vi.hoisted(() => ({
  getLatestTrainingPlanJob: vi.fn(),
  getLatestTrainingPlanReport: vi.fn(),
  startTrainingPlanJob: vi.fn(),
  getTrainingPlanJob: vi.fn(),
  cancelTrainingPlanJob: vi.fn(),
  retryTrainingPlanJob: vi.fn(),
}))

vi.mock('../../api/accountAnalysis', () => apiMocks)

vi.mock('../../services/gameDB', () => ({
  getAnalyzedGame: vi.fn(() => Promise.resolve(undefined)),
}))

vi.mock('../../services/launchAnalytics', () => ({
  trackLaunchEvent: vi.fn(() => Promise.resolve()),
}))

const user = {
  id: 1,
  email: 'test@deepmove.io',
  is_premium: false,
  subscription_status: 'none',
  is_admin: false,
  elo_estimate: null,
  chesscom_username: 'moosetheman123',
  lichess_username: null,
  avatar_url: null,
  lichess_oauth_linked: false,
  google_oauth_linked: false,
  preferences: {},
  created_at: '2026-01-01T00:00:00Z',
}

const report = {
  id: 1,
  created_at: '2026-05-21T12:00:00Z',
  source_platforms: ['chesscom'],
  scanned_range: { months: 12 },
  scan_summary: { eligible_games: 312, minimum_lesson_games: 50, sample_status: 'ready' },
  time_control_breakdown: [{ segment: 'blitz', games: 200 }],
  top_trends: [{ category: 'hung_piece', label: 'Loose pieces', count: 22, confidence: 'verified_examples', segments: { blitz: 20 } }],
  current_focus: {
    category: 'hung_piece',
    title: 'Stop leaving pieces loose.',
    summary: 'Loose-piece signals showed up repeatedly.',
    habit: ['What is attacked?', 'What is undefended?'],
    confidence: 'verified_examples',
  },
  lesson_context: {
    id: 'loose_pieces',
    category: 'hung_piece',
    title: 'Loose pieces / blunder check',
    report_title: 'Stop leaving pieces loose.',
    summary: 'Your games keep reaching loose-piece positions.',
    habit: ['What is attacked?', 'What is undefended?'],
    practice_prompt: 'Find the move that keeps your material defended.',
  },
  review_moments: [{
    id: '12:14:white:g1f3',
    example_id: '12:14:white:g1f3',
    lesson_id: 'loose_pieces',
    game_id: 12,
    platform_game_id: 'https://www.chess.com/game/live/12',
    platform: 'chesscom',
    opponent: 'them',
    result: 'L',
    time_control: '300+0',
    segment: 'blitz',
    move_number: 14,
    color: 'white',
    move_played: 'h4',
    played_san: 'h4',
    better_move_san: 'Nf3',
    better_move_uci: 'g1f3',
    verification_method: 'engine',
    verified: true,
    theme_facts: ['A piece was loose.'],
    practice_prompt: 'Find the move that keeps your material defended.',
    title: 'Loose pieces: move 14 h4',
    coach_note: 'A piece became easier to attack.',
    pgn: '1. e4 e5 2. Nf3 Nc6',
  }],
  verified_examples: [{
    id: '12:14:white:g1f3',
    example_id: '12:14:white:g1f3',
    lesson_id: 'loose_pieces',
    game_id: 12,
    platform_game_id: 'https://www.chess.com/game/live/12',
    platform: 'chesscom',
    opponent: 'them',
    result: 'L',
    time_control: '300+0',
    segment: 'blitz',
    move_number: 14,
    color: 'white',
    move_played: 'h4',
    played_san: 'h4',
    better_move_san: 'Nf3',
    better_move_uci: 'g1f3',
    verification_method: 'engine',
    verified: true,
    theme_facts: ['A piece was loose.'],
    practice_prompt: 'Find the move that keeps your material defended.',
    title: 'Loose pieces: move 14 h4',
    coach_note: 'A piece became easier to attack.',
    pgn: '1. e4 e5 2. Nf3 Nc6',
  }],
  opening_context: [{ opening: 'Italian Game', color: 'white', games: 12 }],
  quality_summary: { verified_count: 1 },
  technical_evidence: {},
}

describe('AccountAnalysisPage', () => {
  beforeEach(() => {
    apiMocks.getLatestTrainingPlanJob.mockReset()
    apiMocks.getLatestTrainingPlanReport.mockReset()
    apiMocks.startTrainingPlanJob.mockReset()
    apiMocks.getTrainingPlanJob.mockReset()
    apiMocks.cancelTrainingPlanJob.mockReset()
    apiMocks.retryTrainingPlanJob.mockReset()
    useAuthStore.setState({ user, accessToken: 'token', isPremium: false, isLoading: false })
    useGameStore.getState().reset()
  })

  it('shows the first-run Training Plan CTA', async () => {
    apiMocks.getLatestTrainingPlanJob.mockResolvedValue(null)
    apiMocks.getLatestTrainingPlanReport.mockResolvedValue(null)

    render(<AccountAnalysisPage />)

    expect(await screen.findByText('Analyze account history.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Build beta report' })).toBeEnabled()
  })

  it('renders a completed report as a lesson without technical evidence', async () => {
    apiMocks.getLatestTrainingPlanJob.mockResolvedValue(null)
    apiMocks.getLatestTrainingPlanReport.mockResolvedValue(report)

    render(<AccountAnalysisPage />)

    expect(await screen.findByText('Your beta training snapshot is ready.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Study this lesson' })).toBeEnabled()
    expect(screen.getByText('Your lesson')).toBeInTheDocument()
    expect(screen.getByText('Examples from your games')).toBeInTheDocument()
    expect(screen.queryByText('Technical evidence')).not.toBeInTheDocument()
    expect(screen.queryByText('candidate note')).not.toBeInTheDocument()
  })

  it('does not promote unverified review prompts as lesson evidence', async () => {
    const unverifiedReport = JSON.parse(JSON.stringify(report))
    unverifiedReport.verified_examples = unverifiedReport.verified_examples.map((moment: typeof report.verified_examples[number]) => ({
      ...moment,
      verified: false,
      verification_method: 'lesson_prompt',
      better_move_san: 'Qxc2+',
      coach_note: 'Qxc2+ was the forcing move to check before playing quietly.',
    }))
    unverifiedReport.review_moments = unverifiedReport.verified_examples
    apiMocks.getLatestTrainingPlanJob.mockResolvedValue(null)
    apiMocks.getLatestTrainingPlanReport.mockResolvedValue(unverifiedReport)

    render(<AccountAnalysisPage />)

    expect((await screen.findAllByText('No verified lesson yet.')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Study this lesson' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Qxc2/)).not.toBeInTheDocument()
    expect(screen.queryByText('Backed by lesson examples')).not.toBeInTheDocument()
    expect(screen.getByText(/none have engine-verified lesson evidence yet/i)).toBeInTheDocument()
  })

  it('starts a backend job from the CTA', async () => {
    apiMocks.getLatestTrainingPlanJob.mockResolvedValue(null)
    apiMocks.getLatestTrainingPlanReport.mockResolvedValue(null)
    apiMocks.startTrainingPlanJob.mockResolvedValue({
      active_existing: false,
      job: {
        id: 3,
        status: 'queued',
        stage: 'queued',
        progress_pct: 0,
        account_scope: {},
        filters: {},
        requested_game_ids: [],
        completed_game_ids: [],
        error: null,
        report_id: null,
        created_at: '2026-05-21T12:00:00Z',
        updated_at: '2026-05-21T12:00:00Z',
        started_at: null,
        finished_at: null,
      },
    })

    render(<AccountAnalysisPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Build beta report' }))

    await waitFor(() => expect(apiMocks.startTrainingPlanJob).toHaveBeenCalled())
    expect(await screen.findByText('Queued')).toBeInTheDocument()
  })

  it('opens a checked example in lesson review context', async () => {
    apiMocks.getLatestTrainingPlanJob.mockResolvedValue(null)
    apiMocks.getLatestTrainingPlanReport.mockResolvedValue(report)
    const onOpenReview = vi.fn()

    render(<AccountAnalysisPage onOpenReview={onOpenReview} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Study example' }))

    await waitFor(() => expect(onOpenReview).toHaveBeenCalledWith('lesson'))
    expect(useGameStore.getState().lessonReviewContext?.lessonId).toBe('loose_pieces')
    expect(useGameStore.getState().lessonReviewContext?.betterMoveSan).toBe('Nf3')
    expect(useGameStore.getState().pendingReviewTarget?.plyIndex).toBe(26)
  })
})
