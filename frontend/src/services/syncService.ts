// syncService.ts — Sync IndexedDB games with the DeepMove backend.
// Handles initial migration (on signup) and ongoing sync (after each analysis).

import { api } from '../api/client'
import { getCachedGamesForUser, saveAnalyzedGame } from './gameDB'
import { getIdentity } from './identity'
import type { AnalyzedGameRecord } from './gameDB'

interface SyncStatusResponse {
  to_upload: string[]
  to_download: GameServerResponse[]
}

interface GameServerResponse {
  id: number
  platform: string
  platform_game_id: string | null
  pgn: string
  user_color: string | null
  user_elo: number | null
  opponent: string | null
  opponent_rating: number | null
  result: string | null
  time_control: string | null
  end_time: number | null
  move_evals: unknown[] | null
  critical_moments: unknown[] | null
  analyzed_at: string | null
  created_at: string
}

interface GameSyncResult {
  platform_game_id: string
  db_id: number
}

interface BatchResponse {
  created: number
  updated: number
  errors: string[]
  results: GameSyncResult[]
}

export interface SyncResult {
  uploaded: number
  downloaded: number
}

/**
 * Run a full sync: compare local IndexedDB games with server, upload/download as needed.
 */
export async function syncGames(): Promise<SyncResult> {
  const identity = getIdentity()
  const allLocal: AnalyzedGameRecord[] = []

  // Gather all local games across platforms
  for (const platform of ['chesscom', 'lichess'] as const) {
    const username = identity[platform]
    if (!username) continue
    const games = await getCachedGamesForUser(username, platform)
    allLocal.push(...games)
  }

  if (allLocal.length === 0) return { uploaded: 0, downloaded: 0 }

  // Ask server what needs syncing
  const syncStatus = await api.post<SyncStatusResponse>('/games/sync-status', {
    games: allLocal.map(g => ({
      platform_game_id: g.id,
      analyzedAt: g.analyzedAt,
    })),
  })

  let uploaded = 0
  let downloaded = 0

  // Upload games the server doesn't have (in chunks of 20)
  const toUpload = allLocal.filter(g => syncStatus.to_upload.includes(g.id))
  for (let i = 0; i < toUpload.length; i += 20) {
    const chunk = toUpload.slice(i, i + 20)
    const batch = chunk.map(g => ({
      platform: g.platform === 'pgn-paste' ? 'pgn-paste' : g.platform,
      platform_game_id: g.id,
      pgn: g.rawPgn || g.cleanedPgn,
      user_color: g.userColor,
      user_elo: g.userElo,
      opponent: g.opponent,
      opponent_rating: g.opponentRating,
      result: g.result,
      time_control: g.timeControl,
      end_time: g.endTime,
      move_evals: g.moveEvals,
      critical_moments: g.criticalMoments,
      analyzed_at: g.analyzedAt ? new Date(g.analyzedAt).toISOString() : null,
    }))
    const result = await api.post<BatchResponse>('/games/batch', batch)
    uploaded += result.created + result.updated
    // Write backendGameId back to each IndexedDB record so coaching can do direct PK lookup
    for (const { platform_game_id, db_id } of result.results ?? []) {
      const record = chunk.find(g => g.id === platform_game_id)
      if (record) await saveAnalyzedGame({ ...record, backendGameId: db_id })
    }
  }

  // Download games the client doesn't have
  for (const serverGame of syncStatus.to_download) {
    const record: AnalyzedGameRecord = {
      id: serverGame.platform_game_id ?? `server:${serverGame.id}`,
      username: identity.chesscom ?? identity.lichess ?? '',
      platform: serverGame.platform as 'chesscom' | 'lichess' | 'pgn-paste',
      rawPgn: serverGame.pgn,
      cleanedPgn: serverGame.pgn,
      userColor: serverGame.user_color as 'white' | 'black' | null,
      userElo: serverGame.user_elo ?? 1200,
      moveEvals: (serverGame.move_evals ?? []) as AnalyzedGameRecord['moveEvals'],
      criticalMoments: (serverGame.critical_moments ?? []) as AnalyzedGameRecord['criticalMoments'],
      analyzedAt: serverGame.analyzed_at ? new Date(serverGame.analyzed_at).getTime() : Date.now(),
      opponent: serverGame.opponent ?? '',
      opponentRating: serverGame.opponent_rating ?? 0,
      result: (serverGame.result ?? 'D') as 'W' | 'L' | 'D',
      timeControl: serverGame.time_control ?? '',
      endTime: serverGame.end_time ?? 0,
      backendGameId: serverGame.id,
    }
    await saveAnalyzedGame(record)
    downloaded++
  }

  return { uploaded, downloaded }
}

/**
 * Push a single game to the server (called after each analysis completes).
 * Returns the backend DB id so callers can update the IndexedDB record.
 */
export async function pushGame(game: AnalyzedGameRecord): Promise<number | null> {
  const response = await api.post<{ id: number }>('/games', {
    platform: game.platform,
    platform_game_id: game.id,
    pgn: game.rawPgn || game.cleanedPgn,
    user_color: game.userColor,
    user_elo: game.userElo,
    opponent: game.opponent,
    opponent_rating: game.opponentRating,
    result: game.result,
    time_control: game.timeControl,
    end_time: game.endTime,
    move_evals: game.moveEvals,
    critical_moments: game.criticalMoments,
    analyzed_at: game.analyzedAt ? new Date(game.analyzedAt).toISOString() : null,
  })
  const backendGameId = response?.id ?? null
  if (backendGameId !== null) {
    await saveAnalyzedGame({ ...game, backendGameId })
  }
  return backendGameId
}

/**
 * Migrate local data on signup: push identity + all IndexedDB games to server.
 */
export async function migrateOnSignup(): Promise<SyncResult> {
  const identity = getIdentity()

  // Link platform usernames to the new account
  const profileUpdate: Record<string, string> = {}
  if (identity.chesscom) profileUpdate.chesscom_username = identity.chesscom
  if (identity.lichess) profileUpdate.lichess_username = identity.lichess
  if (Object.keys(profileUpdate).length > 0) {
    await api.patch('/users/me', profileUpdate)
  }

  // Sync all local games
  const result = await syncGames()

  // Mark migration as complete
  localStorage.setItem('deepmove_migrated', 'true')

  return result
}
