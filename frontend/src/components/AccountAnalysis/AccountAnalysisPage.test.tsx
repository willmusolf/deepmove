import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AccountAnalysisPage from './AccountAnalysisPage'
import { useAuthStore } from '../../stores/authStore'

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
  scan_summary: { eligible_games: 312, candidate_positions: 44, engine_note: 'candidate note' },
  time_control_breakdown: [{ segment: 'blitz', games: 200 }],
  top_trends: [{ category: 'hung_piece', label: 'Loose pieces', count: 22, confidence: 'verified_examples', segments: { blitz: 20 } }],
  current_focus: {
    category: 'hung_piece',
    title: 'Stop leaving pieces loose.',
    summary: 'Loose-piece signals showed up repeatedly.',
    habit: ['What is attacked?', 'What is undefended?'],
    confidence: 'verified_examples',
  },
  review_moments: [{
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
    title: 'Loose pieces: move 14 h4',
    coach_note: 'A piece became easier to attack.',
    pgn: '1. e4 e5 2. Nf3 Nc6',
  }],
  opening_context: [{ opening: 'Italian Game', games: 12 }],
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
  })

  it('shows the first-run Training Plan CTA', async () => {
    apiMocks.getLatestTrainingPlanJob.mockResolvedValue(null)
    apiMocks.getLatestTrainingPlanReport.mockResolvedValue(null)

    render(<AccountAnalysisPage />)

    expect(await screen.findByText('Analyze account history.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Build beta report' })).toBeEnabled()
  })

  it('renders a completed report with collapsed technical evidence', async () => {
    apiMocks.getLatestTrainingPlanJob.mockResolvedValue(null)
    apiMocks.getLatestTrainingPlanReport.mockResolvedValue(report)

    render(<AccountAnalysisPage />)

    expect(await screen.findByText('Your beta training snapshot is ready.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start 10-minute review' })).toBeEnabled()
    expect(screen.getByText('Technical evidence')).toBeInTheDocument()
    expect(screen.queryByText('candidate note')).not.toBeVisible()
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
})
