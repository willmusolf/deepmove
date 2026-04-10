# Architecture Decision Records (ADRs)
Log every significant technical decision here. Date, decision, rationale, alternatives considered.

---

## 2026-03-12 — Initial Architecture Decisions

### ADR-001: Hybrid Chess Intelligence Architecture
**Decision:** Chess intelligence (analysis, feature extraction, classification) is deterministic code. LLM only handles natural language lesson generation.
**Rationale:** LLMs hallucinate chess analysis. Grounding all facts in Stockfish + verified TypeScript code prevents the #1 failure mode of "AI chess coaching": confidently wrong lessons.
**Rejected alternative:** Pure LLM chess analysis (Lichess tried this — it was inaccurate and users caught it immediately).

### ADR-002: Stockfish WASM in Web Worker
**Decision:** Stockfish runs client-side in a Web Worker via WASM. Never on the main thread.
**Rationale:** Zero server cost for engine analysis. UI never freezes. Scales to infinite users without compute costs.
**Consequence:** Requires COOP/COEP headers in both dev (Vite config) and production (vercel.json).

### ADR-003: Client-Side Chess.com / Lichess API Calls
**Decision:** Game fetching from Chess.com and Lichess is done directly from the browser, not proxied through our backend.
**Rationale:** Both APIs are CORS-enabled for read-only endpoints. Client-side calls mean no server rate limiting — each user's browser has its own limit. Zero server cost for game fetching.
**How Chessigma does it:** Same approach — direct browser requests to Chess.com's public API.

### ADR-004: No Redis for MVP
**Decision:** Use in-memory LRU cache (cachetools) for LLM response caching. No Redis.
**Rationale:** Redis adds operational complexity and a failure point. In-memory LRU is sufficient until we have meaningful traffic. Cache resets on server restart — acceptable for MVP.
**Upgrade path:** Swap `cachetools.LRUCache` for Upstash Redis client. Single service change, rest of codebase unchanged.

### ADR-005: Neon for PostgreSQL
**Decision:** Use Neon serverless PostgreSQL. Migrated from Supabase (2026-03-27).
**Original rationale:** No Docker, no database admin, free dev tier.
**Migration rationale:** Neon offers serverless auto-scaling, branching for dev/preview, and a more generous free tier. Supabase was only used as a plain Postgres host — no SDK features were in use, making the migration a connection string swap.
**Upgrade path:** Neon Pro ($19/mo) if we exceed free tier limits.

### ADR-006: Vercel (Frontend) + Railway (Backend)
**Decision:** Frontend on Vercel, backend on Railway.
**Rationale:** Vercel: zero-config for Vite/React, global CDN, free tier handles 1000+ daily visits. Railway: simple Python/FastAPI hosting, auto-deploy from GitHub, $5/mo hobby plan.
**Accounts:** Personal accounts (not org) — transfer to org later if project grows to a team.

### ADR-007: Closed Source
**Decision:** Private GitHub repo. All Rights Reserved. No license file.
**Rationale:** The coaching prompts, principle classifier, and LLM pipeline are the product moat. Making these open would hand competitors the differentiator.
**Future plan:** Open-source the non-proprietary parts (board rendering, Stockfish integration, game import) in 6-12 months if/when it makes sense. Use AGPL for those parts (Lichess model).

### ADR-008: Confidence Scoring for Principle Classification
**Decision:** Principle classifier outputs a confidence score 0-100. High confidence (70+) → full principle lesson. Low confidence (<70) → simplified observation-based lesson.
**Rationale:** A confidently-worded lesson about the wrong principle is worse than no lesson. The confidence fallback protects against teaching incorrect concepts. This is the key difference between DeepMove and a wrapper that generates convincing but wrong coaching.

### ADR-009: CLASSIFIER PRIORITY QUEUE
**Decision:** TACTICAL_01 (Blunder Check) and TACTICAL_02 (Ignored Threat) suppress ALL other principle classifications at a critical moment.
**Rationale:** From GM Studer's "Leaky Roof" concept. A hanging piece is always the most urgent lesson — never also mention pawn structure. One lesson, the most urgent one.

### ADR-010: Test Feature Extractors Before Wiring to LLM
**Decision:** Build and validate all feature extractors with comprehensive unit tests BEFORE connecting the coaching pipeline.
**Rationale:** Wrong features → wrong classification → wrong LLM lesson → user learns incorrect chess. The test-first approach for chess logic prevents this cascade failure. Tests are written before features (not after).

---

## Implemented Features

### ADR-011: Move Annotations — Blunder/Inaccuracy/Good/Great/Brilliant
**Status:** Implemented (Track A)
**Decision:** Classify each move by comparing eval before and after the move (from the perspective of the side that moved). Render colored grade badge next to each move in MoveList.
**Actual thresholds (centipawns):**
- Best — ≤10cp loss
- Excellent — ≤30cp loss
- Good — ≤100cp loss
- Inaccuracy — ≤200cp loss
- Mistake — ≤400cp loss
- Blunder — >400cp loss
**Implementation:** `classifyMove()` in `engine/analysis.ts`. Grade badges rendered in `components/Board/MoveList.tsx`.

### ADR-012: Best Move Arrows + Multi-PV
**Status:** Implemented (Track A)
**Decision:** After analysis, overlay arrows on the board showing the engine's top moves for the current position.
**Implementation:** Multi-PV arrows via chessground `autoShapes` (green=best, paleBlue=2nd, yellow=3rd). BestLines panel above move list — click to enter variation mode (arrow keys step through PV, Esc exits). Position analysis triggered after full-game analysis completes.

### ADR-013: Move Grading System Research — Expected Points vs. Centipawn Loss
**Status:** Research complete (2026-03-22)

#### Chess.com CAPS2
Uses an **Expected Points** model based on win probability, not raw centipawns. Each move is graded by how much expected value (0.0–1.0) was lost. Thresholds are adjusted by player rating.
- Best ≤0.00, Excellent ≤0.02, Good ≤0.05, Inaccuracy ≤0.10, Mistake ≤0.20, Blunder >0.20
- Formula is proprietary and not publicly disclosed.

#### Lichess Accuracy
Open-source win% formula: `50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)`
Per-move accuracy: `103.1668 * exp(-0.04354 * delta) - 3.1669`
Uses harmonic mean to heavily penalize blunders. DeepMove already implements this formula in `cpToWinPct` + `computeAccuracy` in `engine/analysis.ts`.

#### Chessigma
Uses custom labels (Sigma, Awesome, Best, Nice, Ok, Theoretical, Strange, Bad, Clown). Unknown thresholds, centipawn-based. Depth 14 for most positions.

#### DeepMove Current Approach
Raw centipawn-loss thresholds (ADR-011). Transparent and debuggable. 90% of the value of Expected Points for MVP.

**Upgrade path:** The Lichess logistic function (`cpToWinPct`) is already in `analysis.ts`. To adopt chess.com-style grading, swap `classifyMove()` to use win-probability delta (winBefore - winAfter) instead of raw cp loss, then tune per-Elo threshold tables. Defer to post-MVP.

**Open-source reference:** [Chesskit by GuillaumeSD](https://github.com/GuillaumeSD/Chesskit) — similar architecture, useful for comparison.

### ADR-014: Background Tab Analysis — No Special Handling Needed
**Status:** Verified (2026-03-22)

**Decision:** No keepalive or visibility API handling required for Stockfish background analysis.

**Reason:** Web Workers using `postMessage` are not subject to browser background throttling. Only `setTimeout`/`setInterval`/`requestAnimationFrame` are throttled in background tabs. The entire analysis pipeline in DeepMove uses pure `postMessage` UCI communication with zero timers in the analysis loop (the only timer is a one-time 60s init safety timeout in `stockfish.ts`). Analysis will continue at full speed regardless of tab visibility.

### ADR-015: Analysis-First Coaching Pipeline — 6 Categories Replace 19 Principles
**Status:** Implemented (2026-03-31)

**Decision:** Replace the principle-first coaching model (19 taxonomy principles + confidence gates) with an analysis-first model using 6 mistake categories derived directly from feature extraction output.

**Categories:** `hung_piece` · `ignored_threat` · `missed_tactic` · `aimless_move` · `didnt_develop` · `didnt_castle`

**Key changes:**
- `determineCategory()` in `classifier.ts` maps features → category (no principle lookup required)
- `buildAnalysisFacts()` builds 5 deterministic fact sentences fed to the LLM — the LLM never guesses at position details
- `hadClearPurpose` in `moveImpact.ts` widened: pawn moves, rook moves, and centralizing moves are never `aimless_move`
- Sacrifice guard in `determineCategory`: if `futureUserScores` recovers >+50cp within 3 half-moves, suppress `hung_piece` (deliberate sacrifice)

**Rationale:** The 19-principle model required the classifier to be confident about subtle strategic concepts it couldn't reliably detect. The 6-category model only labels things the feature extractor can verify directly (e.g. "piece is literally hanging" → `hung_piece`). This eliminates wrong-concept lessons at the cost of some granularity — acceptable for MVP.

### ADR-016: Coach Tab Layout — MoveCoachComment Above Shared MoveList
**Status:** Implemented (2026-03-31)

**Decision:** Coach tab = eval display + `MoveCoachComment` box (where the graph was) + `MoveList`. Analysis tab = unchanged (eval display + BestLines + EvalGraph + MoveList). Both tabs share the same `MoveList` component and `currentMoveIndex` state.

**Rationale:** Avoids building a parallel transcript component. The MoveList already handles variations, grades, and navigation correctly. The only addition to the Coach tab is the `MoveCoachComment` box which updates reactively as `currentMoveIndex` changes — zero new navigation logic required.

**Removed:** `CoachPanel.tsx` (replaced by `MoveCoachComment` + `MoveList` directly). `GameTranscript.tsx` was built then deleted in the same session — the MoveList approach was simpler and already existed.

### ADR-017: Classifier Threshold Calibration + Dead-Lost Suppression
**Status:** Implemented (2026-04-02)

**Decisions:**
- `hung_piece` threshold: 100cp swing for pieces, 200cp for pawns (previously uniform ~100cp)
- Pawn/minor piece hang yields to `missed_tactic` when `engineMoveImpact.isForcing && evalSwing ≥ 250` — avoids labeling "your pawn is hanging" when the real issue is a knight fork or tactical blow
- `missed_tactic` threshold raised from 90cp → 150cp — 90cp was too low, flagging normal engine-preferred captures as "missed tactics"
- `aimless_move` on ≥200cp swing → reclassified as `missed_tactic` (a move that bad isn't aimless, it walked into something)
- `didnt_develop` skipped for minor piece moves with evalSwing <120cp — covers forced retreats that aren't development failures
- Dead-lost endgame suppression: if `evalAfter ≤ -500 && gamePhase === 'endgame'`, lesson is skipped entirely — teaching in a resignable position is noise, not signal
- `criticalMoments.ts`: skip moments where `userEvalBefore ≤ -600` (position was already resignable before the move)
- Eval capped at ±1000cp before cpLoss calculation to prevent ±10000cp swings from skewing category selection

**Rationale:** Original thresholds were calibrated from theory, not real games. After QA with moosetheman123 games, almost every lesson was either wrong category or triggered on non-lesson positions. These thresholds significantly reduce false positives at the cost of fewer (but more accurate) lessons.

### ADR-018: Progressive Critical Moment Detection During Analysis
**Status:** Implemented (2026-04-02)

**Decision:** Call `detectCriticalMoments()` inside `onMoveComplete` after ≥10 moves have been evaluated, not only after full analysis completes. This updates `criticalMoments` state mid-analysis and allows `useCoaching` to begin fetching lessons before Stockfish finishes.

**Guard:** `fetchedKeysRef` (a `Set<string>` keyed by `moveNumber:color`) in `useCoaching.ts` prevents re-fetching the same moment when `criticalMoments` updates again later with more moments.

**Rationale:** Previously lessons only appeared after the user navigated to a move post-analysis. Progressive detection means lessons start loading during the analyzing bar phase, so they're ready immediately when analysis ends.

### ADR-019: Switch Lesson LLM from Sonnet to Haiku
**Status:** Implemented (2026-04-05)

**Decision:** Changed `lesson_model` in `config.py` from `claude-sonnet-4-6` to `claude-haiku-4-5-20251001`. Both classification and lesson generation now use Haiku.

**Context:** Lesson requests were consistently timing out (20s frontend timeout). Sonnet response times ranged 3-15s per call; with 3 lessons staggered 800ms apart, all three would frequently exceed the timeout. Additionally, a broken `pydantic_core` install in the backend venv was causing silent LLM call failures.

**Rationale:** The lesson prompt is highly constrained (2-4 sentences from pre-verified facts + few-shot examples in `system.py`). Haiku responds in 0.7-3s vs Sonnet's 3-15s. QA testing shows comparable lesson quality for this narrow task. Paired with a singleton Anthropic client (connection reuse) and backend timeout reduction (20→15s), this drops total lesson load time from "usually times out" to ~2s per lesson.

**Revert path:** Single line change in `config.py`. If lesson quality regresses for 1400+ Elo users, can switch back to Sonnet or use Haiku for sub-1400 and Sonnet for 1400+.

### ADR-020: Singleton Anthropic Client
**Status:** Implemented (2026-04-05)

**Decision:** Replaced per-request `anthropic.AsyncAnthropic()` instantiation in `coaching.py` with a lazy module-level singleton via `_get_client()`. Saves ~200-500ms per request from TLS handshake elimination and enables HTTP/2 connection multiplexing.

### ADR-021: Multiple Premove Queue Architecture (chessground unset event bypass)
**Status:** Implemented (2026-04-07)

**Decision:** Replace the single `pendingPremoveRef` with `premoveQueueRef` (array, max 5 entries). Each chessground `premovable.events.set` call APPENDS to the queue. The `unset` event is deliberately NOT wired to the queue. Queue is drained one entry per bot move via `drainPremoveQueue()`. Entire queue clears if any premove is illegal (Chess.com behaviour).

**Root cause of original breakage:** The FEN sync effect in `ChessBoard.tsx` called `apiRef.current.cancelPremove()` after every bot move. `cancelPremove()` internally calls `board.unsetPremove()` which fires `premovable.events.unset`. The `unset` handler was wired to `clearPremoveQueue()`, so the queue was cleared on every FEN update — before `drainPremoveQueue` could consume it.

**Fix:** Remove `cancelPremove()` from the FEN sync effect entirely (not needed — `api.set({fen})` already updates the board). Remove the `unset` handler from `premovable.events` init — chessground fires `unset` in too many internal code paths (drag-end before setPremove, cancelPremove, stop) to use it reliably for queue management.

**Queue clear triggers (explicit, not via chessground):** illegal premove fires, user makes a real move, right-click on board (onContextMenu), entering browse mode (setBrowsePosition wrapper), game start, game resign.

**Rationale:** Chess.com supports up to 5 queued premoves. The queue-not-arrow pattern (piece visually moves to dest immediately) is still a TODO — current impl shows red DrawShape arrows instead.

### ADR-022: Virtual FEN Premove Visualization
**Status:** Implemented (2026-04-07)

**Decision:** Replace manual `api.setPieces(diff)` overlay + red DrawShape arrows with a "virtual FEN" approach. `useBotPlay` computes `virtualBoardFen` via `useMemo([currentFen, premoveQueue])` — replays the entire premove queue on `currentFen` via chess.js and returns the resulting FEN. This is passed as the `fen` prop to ChessBoard, so chessground's `anim.js` `closer()` algorithm naturally animates premoved pieces as smooth moves.

**Context:** The original manual overlay approach (setPieces on the FEN sync effect) had three bugs: (1) pieces didn't snap to dest squares correctly, (2) highlights lingered when queue changed, (3) cancelled premoves didn't visually reset. The virtual FEN approach eliminates all three by making the board's FEN always reflect the post-queue position.

**Key behavior changes:**
- `premovable.enabled = false` — chessground's built-in premove system disabled; we handle premoves entirely in React state
- `handleUserMove` + `handlePremoveSet` merged into single `handleBoardMove` callback
- `userPerspective` prop on ChessBoard: when set and `!interactive`, flips FEN turn in `useMemo` so user can always drag their own pieces while bot thinks
- Premove promotion: always auto-queen (no picker shown for premoves)
- Queue size cap removed — unlimited premoves allowed
- **CRITICAL BUG DISCOVERED**: The turn-flip condition must be `if (userPerspective && !interactive)` — if `interactive=true` (user's real turn) is not excluded, the effectiveTurn assignment breaks subsequent real moves (users can only move once)

**Remaining issue:** `.premove-sq-highlight` overlay squares not rendering + board gets stuck after first premove drag. To diagnose in next session.

**Rationale:** chessground's `closer()` in `anim.js` matches disappearing pieces to appearing pieces of the same type/color by proximity distance. This means `api.set({fen: virtualFen})` correctly animates premoved pieces as moves, not appear/disappear pairs — giving Chess.com-style visualization for free without any manual piece manipulation.

### ADR-023: premoveQueue Moved to Zustand for Atomic Updates
**Status:** Implemented (2026-04-10)

**Decision:** Moved `premoveQueue` from React `useState` (in `BotPlayPage.tsx`) to Zustand `playStore`, alongside `currentFen`. Added optional `newPremoveQueue` param to `applyMoveToStore` so both are written in a single `setState` call.

**Problem:** With `premoveQueue` in React state and `currentFen` in Zustand, `useSyncExternalStore` (Zustand's subscription mechanism) bypasses React 18 auto-batching. A bot move triggers two separate renders: (1) `currentFen` updates → `virtualBoardFen` recomputes with old queue → board snaps back; (2) queue drains → board re-renders correctly. The snap-back on render 1 caused visible flicker.

**Fix:** Single `setState({ currentFen, premoveQueue })` in `applyMoveToStore` → both values available in the same render → `virtualBoardFen` useMemo computes with the correct (drained) queue → no intermediate snap-back.

### ADR-024: applyPremoveForcefully — Force-Apply Premoves Bypassing chess.js Legality
**Status:** Implemented (2026-04-10)

**Decision:** Added `applyPremoveForcefully(fen, userFenColor, from, to)` exported from `ChessBoard.tsx`. Uses chess.js `put`/`remove` to force-move a piece without any legality check, then returns the resulting FEN. Used as the catch-block fallback in both the `after` callback and the `virtualBoardFen` useMemo in `useBotPlay`.

**Problem:** chess.js `move()` throws `"Invalid move"` for pinned pieces, moves that expose the king, and own-piece destinations. The `catch` block kept `currentFen` unchanged → `virtualBoardFen` = old FEN → FEN sync effect reset the board → snap-back. This made it impossible to visually premove a pinned piece.

**Rationale:** The force-apply is for DISPLAY only. `drainPremoveQueue` still uses chess.js `move()` for strict legality validation when the premove actually fires. If the premove is still illegal at fire time (pinned piece wasn't unblocked), the queue clears — correct Chess.com behaviour.

**Implementation:** `chess.remove(to)` captures ANY piece at dest (including own pieces), then `chess.put(piece, to)` places the premoved piece. Pawn promotions auto-queen. Turn and en-passant fields in the FEN are manually adjusted post-put.

### ADR-025: Fully Permissive getPremoveDests (inBounds Only)
**Status:** Implemented (2026-04-10)

**Decision:** Replaced `notOwn` (inBounds + not own piece) with `inBounds` (pure on-board check) throughout `getPremoveDests`. `addRay` for sliding pieces now extends to the board edge through ALL pieces — own and opponent — without breaking.

**Before:** Premove destinations excluded own-piece squares and ray-blocked squares. A rook with an own bishop on a4 couldn't premove to a5–a8. A knight couldn't premove to a square occupied by an own pawn.

**After:** Every geometrically reachable square for a piece type is a valid premove destination, regardless of current occupancy. Matches Chess.com / Lichess premove behaviour.

**Safety:** `applyPremoveForcefully` (ADR-024) already handles own-piece destinations by calling `chess.remove(to)` before placing the premoved piece. `drainPremoveQueue` validates on fire — still invalid premoves (e.g. own piece still blocking) cause queue clear.
