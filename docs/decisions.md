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

### ADR-005: Supabase for PostgreSQL
**Decision:** Use Supabase managed PostgreSQL instead of self-hosted.
**Rationale:** No Docker, no database admin, free dev tier. Supabase also used by Chessigma and many other successful apps. Scales to production without operational overhead.
**Upgrade path:** If we outgrow Supabase free tier, migrate to Supabase Pro ($25/mo) or Neon Serverless.

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

## Planned Features (not yet implemented)

### ADR-011: Move Annotations — Blunder/Inaccuracy/Good/Great/Brilliant (Planned)
**Decision:** Classify each move by comparing eval before and after the move (from the perspective of the side that moved). Render an icon/color next to each move in MoveList.
**Thresholds (centipawns, approximate):**
- Brilliant (!!) — engine's best move AND a sacrifice or unexpected resource
- Great (!) — eval maintained, best or near-best move
- Good — within 0.3 pawns of best
- Inaccuracy (?!) — 0.3–0.9 pawn swing
- Mistake (?) — 0.9–2.0 pawn swing
- Blunder (??) — 2.0+ pawn swing
**Implementation:** Add `annotation` field to `MoveEval` in `engine/analysis.ts`. Classify during `analyzeGame()`. Render in `components/Board/MoveList.tsx` as colored dot or symbol.

### ADR-012: Best Move Arrows (Planned)
**Decision:** After analysis, overlay arrow(s) on the board showing the engine's best move for the current position.
**Implementation:** chessground supports `drawable` shapes via `cg.setAutoShapes([{ orig, dest, brush }])`. After `moveEvals` populate, pass `bestMove` UCI string (e.g. "e2e4") to `ChessBoard.tsx` as a prop. Render on demand (toggle button or always-on after analysis). Use a distinct color (e.g. green for best move, blue for alternative).
**Reference:** chessground docs — `drawable.autoShapes`.
