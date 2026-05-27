import { api } from './client'

export type AnalysisJobStage =
  | 'queued'
  | 'fetching_games'
  | 'scanning_metadata'
  | 'analyzing_candidates'
  | 'deep_reviewing_examples'
  | 'saving_report'
  | 'complete'
  | 'failed'
  | 'cancelled'

export type AnalysisJobStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled'

export interface AnalysisJob {
  id: number
  status: AnalysisJobStatus
  stage: AnalysisJobStage
  progress_pct: number
  account_scope: Record<string, unknown>
  filters: Record<string, unknown>
  requested_game_ids: string[]
  completed_game_ids: string[]
  error: string | null
  report_id: number | null
  created_at: string
  updated_at: string
  started_at: string | null
  finished_at: string | null
}

export interface TrainingPlanFocus {
  category: string
  title: string
  summary: string
  habit: string[]
  confidence: 'trend_signal' | 'verified_examples'
}

export interface ReviewMoment {
  id?: string | null
  example_id?: string | null
  lesson_id?: string | null
  game_id: number
  platform_game_id: string | null
  platform: 'chesscom' | 'lichess' | string
  opponent: string | null
  result: 'W' | 'L' | 'D' | string | null
  time_control: string | null
  segment: string
  move_number: number
  color: 'white' | 'black'
  move_played: string
  played_san?: string | null
  fen_before?: string | null
  fen_after?: string | null
  better_move_san?: string | null
  better_move_uci?: string | null
  eval_loss_cp?: number | null
  win_pct_loss?: number | null
  verification_method?: string | null
  verified?: boolean
  theme_facts?: string[]
  practice_prompt?: string | null
  title: string
  coach_note: string
  pgn: string
}

export interface LessonContext {
  id?: string
  category?: string
  title?: string
  report_title?: string
  summary?: string
  habit?: string[]
  ai_context?: string
  practice_prompt?: string
  example_count?: number
}

export interface TrainingPlanReport {
  id: number
  created_at: string
  source_platforms: string[]
  scanned_range: Record<string, unknown>
  scan_summary: {
    eligible_games?: number
    parsed_games?: number
    candidate_positions?: number
    minimum_lesson_games?: number
    sample_status?: string
    verification_method?: string
    engine_note?: string
    result_counts?: Record<string, number>
  }
  time_control_breakdown: Array<{ segment: string; games: number }>
  top_trends: Array<{
    category: string
    label: string
    count: number
    confidence: 'trend_signal' | 'verified_examples'
    segments: Record<string, number>
  }>
  current_focus: TrainingPlanFocus
  review_moments: ReviewMoment[]
  opening_context: Array<{ opening: string; color?: 'white' | 'black' | string; games: number }>
  lesson_context?: LessonContext
  verified_examples?: ReviewMoment[]
  quality_summary?: Record<string, unknown>
  technical_evidence: Record<string, unknown>
}

export async function startTrainingPlanJob(): Promise<{ job: AnalysisJob; active_existing: boolean }> {
  return api.post('/account-analysis/jobs', {
    max_games: 500,
    months: 12,
    min_initial_seconds: 300,
  }, { timeoutMs: 30000 })
}

export async function getLatestTrainingPlanJob(): Promise<AnalysisJob | null> {
  return api.get('/account-analysis/jobs/latest')
}

export async function getTrainingPlanJob(jobId: number): Promise<{ job: AnalysisJob; report: TrainingPlanReport | null }> {
  return api.get(`/account-analysis/jobs/${jobId}`)
}

export async function cancelTrainingPlanJob(jobId: number): Promise<AnalysisJob> {
  return api.post(`/account-analysis/jobs/${jobId}/cancel`)
}

export async function retryTrainingPlanJob(jobId: number): Promise<AnalysisJob> {
  return api.post(`/account-analysis/jobs/${jobId}/retry`)
}

export async function getLatestTrainingPlanReport(): Promise<TrainingPlanReport | null> {
  const response = await api.get<{ report: TrainingPlanReport | null }>('/account-analysis/reports/latest')
  return response.report
}
