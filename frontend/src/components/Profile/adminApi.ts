import { api } from '../../api/client'

export interface AdminCounts {
  users: number
  games: number
  lessons: number
  principles: number
}

export interface AdminOpsStatus {
  coaching_enabled: boolean
  lesson_cache_entries: number
  counts: AdminCounts
}

export interface AdminActionResult {
  ok: boolean
  message: string
  coaching_enabled?: boolean | null
  lesson_cache_entries?: number | null
}

export function getAdminOpsStatus() {
  return api.get<AdminOpsStatus>('/admin/ops/status')
}

export function setAdminCoachingEnabled(enabled: boolean) {
  return api.post<AdminActionResult>('/admin/ops/coaching', { enabled })
}

export function clearAdminLessonCache() {
  return api.post<AdminActionResult>('/admin/ops/cache/lessons/clear')
}
