import { useCallback, useEffect, useState } from 'react'
import { getRecentGames, loadMoreGames, type ChessComGame } from '../../api/chesscom'
import { getUserGames, type LichessGame } from '../../api/lichess'
import {
  buildAccountAnalysis,
  type AccountAnalysisPlatform,
  type AccountAnalysisSummary,
  type OpeningStats,
} from '../../accountAnalysis/aggregate'
import { getCachedGamesForUser, type AnalyzedGameRecord } from '../../services/gameDB'
import { getIdentity } from '../../services/identity'

interface AccountAnalysisPageProps {
  onOpenReview?: () => void
  onOpenProfile?: () => void
}

interface LoadedAccountGames {
  chesscom: ChessComGame[]
  lichess: LichessGame[]
  analyzed: AnalyzedGameRecord[]
}

const GAME_COUNT_OPTIONS = [25, 50, 100, 150, 200]

function formatDateRange(summary: AccountAnalysisSummary): string {
  const { start, end } = summary.dateRange
  if (!start || !end) return 'No recent games scanned yet'

  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  if (start === end) return fmt.format(new Date(end))
  return `${fmt.format(new Date(start))} - ${fmt.format(new Date(end))}`
}

function formatRecord(opening: OpeningStats): string {
  return `${opening.wins}-${opening.losses}-${opening.draws}`
}

async function fetchChessComGames(username: string, targetCount: number): Promise<ChessComGame[]> {
  let result = await getRecentGames(username)
  let games = result.games
  let guard = 0

  while (games.length < targetCount && result.hasMore && guard < 12) {
    result = await loadMoreGames(result.allArchives, result.fetchedArchives)
    games = [...games, ...result.games]
    guard++
  }

  const seen = new Set<string>()
  return games
    .filter(game => {
      if (seen.has(game.url)) return false
      seen.add(game.url)
      return true
    })
    .sort((a, b) => b.end_time - a.end_time)
}

async function loadAnalyzedGames(
  identity: ReturnType<typeof getIdentity>,
  platform: AccountAnalysisPlatform,
): Promise<AnalyzedGameRecord[]> {
  const all: AnalyzedGameRecord[] = []
  if (platform !== 'lichess' && identity.chesscom) {
    all.push(...await getCachedGamesForUser(identity.chesscom, 'chesscom'))
  }
  if (platform !== 'chesscom' && identity.lichess) {
    all.push(...await getCachedGamesForUser(identity.lichess, 'lichess'))
  }
  return all
}

function OpeningTable({ title, openings }: { title: string; openings: OpeningStats[] }) {
  const visible = openings.slice(0, 6)

  return (
    <section className="account-analysis-card">
      <div className="account-analysis-card__header">
        <h2>{title}</h2>
        <span>{openings.length} opening{openings.length === 1 ? '' : 's'}</span>
      </div>
      {visible.length > 0 ? (
        <div className="account-opening-list">
          {visible.map(opening => (
            <div className="account-opening-row" key={`${opening.color}:${opening.opening}`}>
              <div>
                <strong>{opening.opening}</strong>
                <span>{opening.games} game{opening.games === 1 ? '' : 's'} played</span>
              </div>
              <div className="account-opening-row__score">
                <strong>{opening.scorePct}%</strong>
                <span>{formatRecord(opening)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="account-analysis-empty-copy">No games as {title.toLowerCase()} in this sample.</p>
      )}
    </section>
  )
}

export default function AccountAnalysisPage({ onOpenReview, onOpenProfile }: AccountAnalysisPageProps) {
  const [platform, setPlatform] = useState<AccountAnalysisPlatform>('all')
  const [gameCount, setGameCount] = useState(50)
  const [loaded, setLoaded] = useState<LoadedAccountGames>({ chesscom: [], lichess: [], analyzed: [] })
  const [summary, setSummary] = useState<AccountAnalysisSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [identityVersion, setIdentityVersion] = useState(0)

  const identity = getIdentity()
  const hasLinkedAccount = !!identity.chesscom || !!identity.lichess
  const canFetchPlatform =
    platform === 'all'
      ? hasLinkedAccount
      : platform === 'chesscom'
        ? !!identity.chesscom
        : !!identity.lichess

  const refreshReport = useCallback(async () => {
    const currentIdentity = getIdentity()
    setIdentityVersion(v => v + 1)
    if (!currentIdentity.chesscom && !currentIdentity.lichess) {
      setSummary(null)
      setLoaded({ chesscom: [], lichess: [], analyzed: [] })
      setLoadedOnce(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [chesscom, lichess, analyzed] = await Promise.all([
        platform !== 'lichess' && currentIdentity.chesscom
          ? fetchChessComGames(currentIdentity.chesscom, gameCount)
          : Promise.resolve([]),
        platform !== 'chesscom' && currentIdentity.lichess
          ? getUserGames(currentIdentity.lichess, gameCount).then(result => result.games)
          : Promise.resolve([]),
        loadAnalyzedGames(currentIdentity, platform),
      ])

      const nextLoaded = { chesscom, lichess, analyzed }
      const nextSummary = buildAccountAnalysis({
        chesscomGames: chesscom,
        chesscomUsername: currentIdentity.chesscom,
        lichessGames: lichess,
        lichessUsername: currentIdentity.lichess,
        analyzedGames: analyzed,
        gameCount,
        platform,
      })

      setLoaded(nextLoaded)
      setSummary(nextSummary)
      setLoadedOnce(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load account analysis right now.')
    } finally {
      setLoading(false)
    }
  }, [gameCount, platform])

  useEffect(() => {
    setIdentityVersion(v => v + 1)
  }, [])

  void identityVersion
  const filteredSourceCount = platform === 'all'
    ? loaded.chesscom.length + loaded.lichess.length
    : platform === 'chesscom'
      ? loaded.chesscom.length
      : loaded.lichess.length

  return (
    <div className="account-analysis-page">
      <section className="account-analysis-hero">
        <div>
          <p className="account-analysis-kicker">Account Analysis</p>
          <h1>Find the patterns hiding in your recent games.</h1>
          <p>
            Opening stats use recent fetched Chess.com/Lichess games. Weakness categories use
            games DeepMove has already analyzed, so the report stays fast and honest.
          </p>
        </div>
        <div className="account-analysis-controls" aria-label="Account analysis controls">
          <label>
            Platform
            <select value={platform} onChange={event => setPlatform(event.target.value as AccountAnalysisPlatform)}>
              <option value="all">All linked</option>
              <option value="chesscom">Chess.com</option>
              <option value="lichess">Lichess</option>
            </select>
          </label>
          <label>
            Recent games
            <select value={gameCount} onChange={event => setGameCount(Number(event.target.value))}>
              {GAME_COUNT_OPTIONS.map(option => (
                <option value={option} key={option}>{option}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void refreshReport()}
            disabled={loading || !canFetchPlatform}
          >
            {loading ? 'Scanning...' : 'Refresh report'}
          </button>
        </div>
      </section>

      {!hasLinkedAccount && (
        <section className="account-analysis-empty">
          <h2>Link a chess account to start.</h2>
          <p>Add your Chess.com or Lichess username, then DeepMove can scan recent games for openings and recurring review patterns.</p>
          <div className="account-analysis-empty__actions">
            {onOpenReview && <button type="button" className="btn btn-primary" onClick={onOpenReview}>Load games</button>}
            {onOpenProfile && <button type="button" className="btn btn-secondary" onClick={onOpenProfile}>Open profile</button>}
          </div>
        </section>
      )}

      {hasLinkedAccount && !canFetchPlatform && (
        <section className="account-analysis-empty">
          <h2>No linked account for this platform.</h2>
          <p>Choose another platform or link this account type from Profile.</p>
          {onOpenProfile && <button type="button" className="btn btn-primary" onClick={onOpenProfile}>Open profile</button>}
        </section>
      )}

      {error && (
        <div className="account-analysis-error" role="alert">
          {error}
        </div>
      )}

      {hasLinkedAccount && canFetchPlatform && !summary && !loading && !loadedOnce && (
        <section className="account-analysis-empty">
          <h2>Ready when you are.</h2>
          <p>Run a scan to build a lightweight report from your most recent games.</p>
          <button type="button" className="btn btn-primary" onClick={() => void refreshReport()}>
            Scan recent games
          </button>
        </section>
      )}

      {summary && (
        <>
          <section className="account-analysis-summary-grid">
            <div className="account-analysis-stat">
              <span>Scanned</span>
              <strong>{summary.scannedGames.length}</strong>
              <small>of {summary.requestedGameCount} requested</small>
            </div>
            <div className="account-analysis-stat">
              <span>Reviewed</span>
              <strong>{summary.analyzedGameCount}</strong>
              <small>with DeepMove weakness data</small>
            </div>
            <div className="account-analysis-stat">
              <span>Fetched</span>
              <strong>{filteredSourceCount}</strong>
              <small>available before final recency slice</small>
            </div>
            <div className="account-analysis-stat account-analysis-stat--wide">
              <span>Date range</span>
              <strong>{formatDateRange(summary)}</strong>
              <small>most recent sample</small>
            </div>
          </section>

          <div className="account-analysis-grid">
            <OpeningTable title="White" openings={summary.openingsByColor.white} />
            <OpeningTable title="Black" openings={summary.openingsByColor.black} />
          </div>

          <section className="account-analysis-card">
            <div className="account-analysis-card__header">
              <h2>Recurring Weaknesses</h2>
              <span>{summary.analyzedGameCount} reviewed game{summary.analyzedGameCount === 1 ? '' : 's'}</span>
            </div>
            {summary.weaknesses.length > 0 ? (
              <div className="account-weakness-list">
                {summary.weaknesses.slice(0, 5).map(weakness => (
                  <div className="account-weakness-row" key={weakness.category}>
                    <span className="account-weakness-dot" style={{ background: weakness.color }} />
                    <div>
                      <strong>{weakness.name}</strong>
                      <span>{weakness.shortLabel}</span>
                    </div>
                    <em>{weakness.count}</em>
                  </div>
                ))}
              </div>
            ) : (
              <p className="account-analysis-empty-copy">
                No recurring weakness categories yet. Review a few games in DeepMove and this section will become more specific.
              </p>
            )}
          </section>

          <section className="account-analysis-card account-analysis-takeaways">
            <div className="account-analysis-card__header">
              <h2>What To Work On Next</h2>
            </div>
            <ol>
              {summary.takeaways.map(takeaway => (
                <li key={takeaway}>{takeaway}</li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  )
}
