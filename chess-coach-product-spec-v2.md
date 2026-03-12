# ChessCoach — Product Spec & Technical Architecture (v0.2)

**Date:** March 2026
**Status:** Planning / Pre-Build

---

## 1. Product Vision

**One-liner:** A free AI chess coach that teaches you principles — not moves — derived from your own games, using methods borrowed from the world's greatest chess trainers.

**The problem:** Every chess tool on the market does game review. They tell you "Nf3 was a mistake, Bd4 was better." But that's like a basketball coach watching tape and only saying "you should have passed left." A real coach says "you keep getting burned because you don't box out on rebounds — here's how to fix that." Nobody is building that for chess.

**The deeper problem (via GM Noël Studer):** Accuracy scores are misleading. You can get 90% accuracy but play badly, or 60% and play brilliantly. Chess sites are incentivized to make you a repeat user — the gamification that keeps you coming back (accuracy scores, brilliant move badges) doesn't necessarily align with what actually makes you better. Our incentive IS improvement, full stop.

**The insight:** The coaching layer isn't the engine evaluation — it's pattern recognition across your decisions and the ability to teach the underlying principle you're violating. Stockfish tells you the best move. An LLM can tell you WHY you keep making the same category of mistake and teach you the concept that fixes it.

**Core philosophy — what makes this different from everything else:**
This app is built on the training methodologies of the greatest chess coaches in history. Not a vague "AI coaching" wrapper on top of an engine. A deliberate, structured approach to making you better, grounded in:

- **Dvoretsky's diagnostic method:** Begin with diagnosis of strengths and weaknesses. Every task must have a concrete aim of improving a specific skill.
- **Botvinnik's "think first" principle:** Annotate and reason about your own games BEFORE checking the engine. Thinking for yourself is where real learning happens.
- **Studer's Pareto principle:** 80% of your results come from 20% of your training. Focus on what matters most — usually tactics and learning from your own mistakes.
- **Studer's "leaky roof" concept:** You can study openings all you want, but if you keep hanging pieces, nothing else matters until you fix that.
- **Yusupov's critical moments:** Don't analyze every move. Identify the 2-3 moments that actually decided the game — where a mistake was made, a drastic change happened, or a big opportunity was missed.
- **The Indian school (GM Ramesh):** Less about concrete variations, more about fundamental understanding — how to think, which positional aspects are relevant, how to arrive at candidate moves and plans. Knowing is NOT doing.
- **Studer's One Third Rule:** Spend a third of chess time on games + analysis, a third on tactics, a third on one focused area of weakness. Don't spread thin.

---

## 2. Competitive Landscape

### Direct Competitor #1: Chessigma
- **What they are:** Free unlimited Stockfish game analysis tool. 1.12M monthly visits. Core audience: India, US, France.
- **What they're building:** "AI Supercoach" — still on waitlist, not launched yet. Plans to learn from full game history, identify recurring mistakes, build personalized training plans.
- **Their strengths:** Massive traffic, free analysis, SEO-optimized, growing fast.
- **Their weaknesses:** Cluttered ad-heavy UX. Meme-tier branding ("Sigma" to "Clown" move grades). No articulated coaching philosophy — it's engine analysis with AI wrapping. Trying to be everything at once (analysis, puzzles, Chess Wrapped, AI coach). Two-person team covering server costs from personal funds.
- **Our edge:** We have a clear coaching philosophy grounded in GM training methods. We're not wrapping an engine in AI — we're digitizing how Dvoretsky, Botvinnik, and Studer actually taught. Our UX will be clean and focused. We do ONE thing and do it better than anyone.

### Direct Competitor #2: Sensei Chess
- **What they are:** AI chess coaching platform, currently free. Integrates with Chess.com and Lichess.
- **What they offer:** Move-by-move insights, pattern identification, personalized training, flashcards, progress tracking.
- **Their weakness:** Still fundamentally move-level analysis with AI explanations. No articulated pedagogical framework. No "think first" methodology.
- **Our edge:** Same as above — coaching philosophy, not just analysis.

### Other Competitors
- **Chessvia AI (Chessy):** Voice-enabled AI coach, $7-30/mo. Newest player, launched 2025. Good UX and personality customization. But expensive and still engine-centric.
- **Aimchess:** Owned by Play Magnus/Chess.com. 6-dimension skill analysis, personalized puzzles. $7.99/mo. Closest to pattern diagnosis but doesn't teach principles in natural language from your games.
- **Noctie.ai:** Humanlike AI opponent + lessons. €14/mo. Focus on playing, not coaching.
- **Chess.com Play Coach:** AI opponent that teaches during play. Good concept but locked in Chess.com ecosystem.
- **Lichess Analysis:** Free, excellent, open source. But zero coaching — pure engine analysis.

### The Gap We Fill
Nobody is saying "your problem isn't that you hung a knight on move 23 — your problem is you don't understand pawn structure and that's why you keep ending up in these positions." Nobody is using the Botvinnik "think first" method. Nobody has a structured principle taxonomy that maps mistakes to learnable concepts. Nobody is focused exclusively on making you better with a clear pedagogical framework.

---

## 3. Core User Experience

### The "Think First" Coaching Flow (Default Experience)

This is our primary differentiator. Inspired by the Botvinnik school and Dvoretsky's methods.

```
STEP 1: IMPORT
  Connect Chess.com or Lichess account, paste PGN, or paste game URL.
  
STEP 2: ANALYZE (client-side, invisible to user)
  Stockfish WASM evaluates all positions in the browser.
  System identifies 2-3 CRITICAL MOMENTS per game — positions where
  the eval swung significantly and the game's outcome was decided.
  Not every inaccuracy. Just the moments that mattered.

STEP 3: THE COACHING SESSION
  For each critical moment, the user sees the position on an
  interactive board and is asked:

  [THINK FIRST MODE — default, toggleable]
  "Something went wrong here. Before I tell you what happened,
   what do you think the problem was with your move?"
  
  User types their reasoning (or skips).
  
  The AI coach responds to THEIR thinking — "You're on the right
  track about the knight being exposed, but the deeper issue is..."
  or "Not quite — let's look at this differently..."
  
  Then reveals:
  - What the engine preferred and why
  - The PRINCIPLE being violated (titled, categorized)
  - A 2-3 paragraph lesson explaining the principle using THIS
    position as the example
  - A one-sentence takeaway to remember
  - When this principle applies in future games

  [JUST TELL ME MODE — toggle]
  Same content, but skips the question. Shows position + engine
  recommendation + principle lesson immediately.

STEP 4: GAME SUMMARY
  After reviewing all critical moments:
  - "In this game, you struggled with: [Principle 1], [Principle 2]"
  - "Your strongest area was: [Principle 3]"
  - "Focus for your next games: [specific actionable advice]"

STEP 5: PRINCIPLE TRACKER (builds over time, premium for full history)
  Over multiple games, the app tracks which principles you violate
  most frequently and builds a profile:
  - "Across your last 30 games, King Safety is your biggest weakness
     (violated in 40% of critical moments)"
  - "You've improved at Piece Activity — down from 35% to 15%"
  - Suggested study plan based on your actual weaknesses
```

### What This Looks Like on Screen

The primary interface is an **interactive chessboard** (like Lichess/Chess.com/Chessigma analysis boards) with a **coaching panel** alongside it. Users can step through the game, see the eval bar, and explore variations — the standard game review experience they're used to. BUT: at critical moments, the coaching panel activates with the think-first prompt or the principle lesson card.

This means the app feels familiar to anyone who's used game review before. We're not replacing game review — we're UPGRADING it with a coaching layer that actually teaches.

---

## 4. Principle Taxonomy

Every lesson maps to a principle. This is the curriculum backbone. Principles are categorized and trackable.

### Opening Principles
- Control the center
- Develop pieces before attacking
- Don't move the same piece twice without reason
- Castle early for king safety
- Don't bring the queen out too early
- Connect your rooks
- Complete development before starting operations

### Middlegame — Tactical Awareness
- Check for hanging pieces before every move (the "blunder check")
- Look for double attacks and forks
- Pins and skewers: exploit piece alignment
- Don't ignore your opponent's threats
- Calculate forcing moves first (checks, captures, threats)
- Back-rank awareness

### Middlegame — Positional / Strategic Thinking
- Piece activity over material
- Don't trade when you have a space advantage
- Trade pieces when you're up material — simplify
- Control open files with rooks
- Put knights on outposts
- Avoid creating pawn weaknesses (doubled, isolated, backward)
- Bishop pair advantage in open positions
- Don't weaken your king's pawn shelter
- Improve your worst piece
- Prophylaxis: prevent your opponent's plans before executing yours
- Pawn structure dictates piece placement

### Endgame Principles
- Activate your king in the endgame
- Rooks belong behind passed pawns
- Create passed pawns
- The principle of two weaknesses
- Opposition and key squares in king-pawn endings
- Know your theoretical positions (Philidor, Lucena, Vancura)
- Don't rush — zugzwang and patience

### Decision-Making / Meta Principles
- Time management: don't spend 5 minutes on a forced move
- When ahead, simplify; when behind, complicate
- Have a plan — don't make purposeless moves
- Recognize when to be patient vs. when to strike
- Don't play hope chess — calculate before moving
- The "leaky roof" principle: fix your biggest weakness first

---

## 5. Technical Architecture

### Design Philosophy: The Lichess Way

Lichess handles millions of users with ~$5K/month in server costs because of smart architecture. Key lessons:

- **Client-side computation wherever possible.** Stockfish WASM runs in the user's browser — zero server cost for engine analysis.
- **Fully asynchronous backend.** Lichess uses Scala Futures and Akka streams. We'll use async Node.js or Python (FastAPI).
- **Efficient data storage.** Lichess compresses games using legal-move-index encoding. We store PGN compactly and cache LLM outputs aggressively.
- **Minimal framework overhead.** No bloated SPAs. Fast page loads. Lichess uses TypeScript + snabbdom (lightweight virtual DOM).
- **Separate services for heavy lifting.** Lichess offloads tournament traffic to a Rust service. We offload LLM calls to a separate API service.

### Recommended Stack

```
FRONTEND                          BACKEND                       EXTERNAL
┌──────────────────┐    ┌──────────────────────────┐    ┌─────────────────┐
│                  │    │                          │    │                 │
│  React or Svelte │───▶│  Node.js (Express/Fastify)│───▶│  Claude API     │
│  + TypeScript    │    │  or Python (FastAPI)      │    │  (Haiku for     │
│                  │    │                          │    │   classification,│
│  Stockfish WASM  │    │  PostgreSQL               │    │   Sonnet for    │
│  (client-side)   │    │  (users, games, lessons,  │    │   lesson gen)   │
│                  │    │   principle tracking)      │    │                 │
│  chess.js        │    │                          │    │  Chess.com API  │
│  (move validation│    │  Redis                    │    │  Lichess API    │
│   + PGN parsing) │    │  (caching LLM responses,  │    │                 │
│                  │    │   rate limiting, sessions) │    │                 │
│  chessground     │    │                          │    │                 │
│  (interactive    │    │                          │    │                 │
│   board - used   │    │                          │    │                 │
│   by Lichess)    │    │                          │    │                 │
└──────────────────┘    └──────────────────────────┘    └─────────────────┘
```

### Key Technical Decisions

**Use chessground for the board.** This is the actual board library used by Lichess. It's open source, battle-tested, beautiful, and lightweight. No point reinventing this.

**Stockfish WASM runs client-side.** Same as Lichess, same as Chessigma. Zero server compute cost. Use the Lichess stockfish.wasm build.

**LLM coaching is the only significant server cost.** Optimize aggressively:
- Only send 2-3 critical moments per game (not every move)
- Use Haiku for initial principle classification (cheap, fast)
- Use Sonnet for lesson generation (higher quality, still affordable)
- Cache lessons by principle + position pattern similarity
- Many positions map to the same principles — a hung piece is a hung piece whether it's a knight on f3 or a bishop on c4

**Two-tier LLM pipeline:**
```
Critical moment data (FEN, moves, eval, structural features)
    ↓
HAIKU: Quick classification
  → "This is a King Safety violation, opening phase"
  → Check cache: have we generated a lesson for this principle
    in a similar position recently?
    ↓
If cached → serve cached lesson (adapted to this position)
If not cached →
    ↓
SONNET: Full lesson generation
  → Principle name, explanation, takeaway, contextual advice
  → Cache the output for future similar positions
```

**Chess.com and Lichess APIs for game import:**
- Chess.com: `api.chess.com/pub/player/{username}/games/{YYYY}/{MM}` (public, free)
- Lichess: `lichess.org/api/games/user/{username}` (streaming API, very generous rate limits)
- Both return PGN format. No authentication needed for public games.
- For bulk diagnosis: pull last 50-100 games, run through client-side Stockfish, classify all critical moments.

### Position Feature Extraction (the "chess understanding layer")

Between Stockfish (raw eval) and the LLM (natural language teaching), we build a feature extraction layer that converts a FEN into structured chess concepts:

```
Given a FEN position, extract:
- Pawn structure type (open/closed/semi-open)
- Pawn weaknesses (isolated, doubled, backward pawns for each side)
- King safety score (pawn shield integrity, pieces near king)
- Piece activity (centralization, mobility)
- Open/half-open files and who controls them
- Material balance
- Development status (how many pieces developed)
- Game phase (opening/middlegame/endgame based on material + move number)
- Specific patterns (fianchetto, castled/uncastled, connected rooks)
```

This gives the LLM structured concepts to reason about rather than just a FEN string. The LLM doesn't need to "understand" chess — it needs to understand chess CONCEPTS, which we pre-extract.

---

## 6. The Coaching Prompt Pipeline (Technical Detail)

### Step 1: Critical Moment Detection (Client-Side)

After Stockfish evaluates all positions:
- Calculate eval swing between consecutive positions
- Flag moments where |eval_change| > 1.0 pawns (adjustable by rating)
- For lower-rated players, also flag moments where |eval_change| > 0.5 if the position went from equal to losing
- Rank moments by magnitude of swing
- Select top 2-3 moments per game
- Also flag missed opportunities (opponent blundered but user didn't capitalize)

### Step 2: Feature Extraction (Client-Side)

For each critical moment, extract:
```json
{
  "fen": "r1bqkb1r/pppppppp/2n2n2/8/3PP3/8/PPP2PPP/RNBQKBNR",
  "move_played": "dxe5",
  "engine_best": ["d5", "Bb4+"],
  "eval_before": 0.3,
  "eval_after": -0.8,
  "eval_swing": -1.1,
  "game_phase": "opening",
  "move_number": 8,
  "material_balance": "equal",
  "pawn_structure": "semi-open, white has isolated e-pawn",
  "king_safety": "both kings uncastled",
  "piece_activity": "white has better development",
  "specific_observations": [
    "user captured toward the edge instead of maintaining central tension",
    "opponent's knight on c6 is well-placed"
  ]
}
```

### Step 3: LLM Coaching Call (Server-Side)

**System prompt (core of the product — this must be excellent):**

```
You are a world-class chess coach in the tradition of Mark Dvoretsky
and the Botvinnik school. You do NOT just tell students what move was
better. You identify the PRINCIPLE they need to understand so that
the right move becomes obvious to them in future games.

Your teaching philosophy:
- Focus on the WHY, not the WHAT
- Connect specific mistakes to general, reusable principles
- Use the student's own position as the teaching example
- Explain at the appropriate level for the student's rating
- Be encouraging but honest — never dismiss mistakes, use them
  as learning opportunities
- Relate to the "leaky roof" concept: if a student keeps making
  the same type of mistake, that's the priority to fix
- Every lesson should give the student something they can
  immediately apply in their next game

You will receive:
- A critical position from the student's game
- The move they played vs. what the engine recommends
- Structural features of the position
- The student's approximate rating

Respond with a JSON object:
{
  "principle_name": "Short, memorable title (e.g., 'Maintain Central Tension')",
  "principle_category": "opening|middlegame_tactical|middlegame_positional|endgame|decision_making",
  "lesson": "2-3 paragraphs explaining the principle, using THIS specific position as the teaching example. Write as a coach speaking to the student — warm, clear, direct. Reference specific squares and pieces in the position.",
  "takeaway": "One sentence the student should remember and apply in future games.",
  "applies_when": "Brief description of the general situations where this principle is relevant.",
  "what_to_look_for": "A specific, concrete thing the student should check for in future games to avoid this mistake."
}
```

**If Socratic mode is on, additional prompt for responding to user's reasoning:**

```
The student was shown this position and asked what they think went
wrong. Their response was: "{user_response}"

First, acknowledge what they got right (if anything). Then gently
correct what they missed. Then deliver the principle lesson.
Do NOT be condescending. Treat their reasoning seriously — even
wrong answers show how they're thinking, which is valuable diagnostic
information.
```

---

## 7. Data Model

```sql
-- Users
users (
  id              UUID PRIMARY KEY,
  email           TEXT,
  chess_com_user   TEXT,
  lichess_user     TEXT,
  rating_estimate  INT,
  is_premium       BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMP
)

-- Imported games
games (
  id              UUID PRIMARY KEY,
  user_id         UUID REFERENCES users,
  pgn             TEXT,
  source          TEXT,  -- 'chess.com', 'lichess', 'pgn_paste'
  result          TEXT,
  time_control    TEXT,
  played_at       TIMESTAMP,
  imported_at     TIMESTAMP
)

-- Critical moments (2-3 per game)
critical_moments (
  id              UUID PRIMARY KEY,
  game_id         UUID REFERENCES games,
  move_number     INT,
  fen             TEXT,
  move_played     TEXT,
  engine_best     TEXT,
  eval_before     FLOAT,
  eval_after      FLOAT,
  game_phase      TEXT,
  features_json   JSONB  -- extracted position features
)

-- AI coaching lessons
lessons (
  id                UUID PRIMARY KEY,
  moment_id         UUID REFERENCES critical_moments,
  principle_name    TEXT,
  principle_category TEXT,
  lesson_text       TEXT,
  takeaway          TEXT,
  applies_when      TEXT,
  what_to_look_for  TEXT,
  user_reasoning    TEXT,  -- what the user said in Socratic mode (nullable)
  coach_response    TEXT,  -- response to user's reasoning (nullable)
  created_at        TIMESTAMP
)

-- Principle tracking across games
principle_violations (
  id              UUID PRIMARY KEY,
  user_id         UUID REFERENCES users,
  lesson_id       UUID REFERENCES lessons,
  game_id         UUID REFERENCES games,
  principle_name  TEXT,
  principle_category TEXT,
  recorded_at     TIMESTAMP
)

-- LLM response cache (save money)
lesson_cache (
  id              UUID PRIMARY KEY,
  principle_name  TEXT,
  game_phase      TEXT,
  position_hash   TEXT,  -- similarity hash for cache matching
  lesson_text     TEXT,
  created_at      TIMESTAMP
)
```

---

## 8. Monetization

### Model: "The First Coaching Session" (Option 1)

**Free Tier (ad-supported):**
- Import unlimited games from Chess.com, Lichess, or PGN
- Full Stockfish analysis on interactive board (client-side, free)
- AI coaching on critical moments — Think First mode + principle lessons
- First bulk account scan FREE (connect account, get full diagnostic of your weaknesses across your last 50 games — the "first session with the coach")
- Small, tasteful banner ad (single 728x90 strip, bottom of page)
  - Use Carbon Ads or EthicalAds for clean, developer-audience ads
  - NO popups, NO interstitials, NO video ads, NO ad walls
  - Ad loads async, never blocks page render

**Premium (~$4/month):**
- Remove all ads
- Unlimited ongoing bulk re-scans (track whether you're improving over time)
- Full principle tracker dashboard with trends
- Weekly coaching summary ("This week you improved at X, still struggling with Y")
- Lesson history and bookmarking
- Priority LLM response times
- Deeper Socratic interactions (follow-up questions, "explain more")

### Why This Model

**Why not pure donation (Lichess model):**
Lichess works on donations because their biggest cost (Stockfish analysis) runs client-side. Our biggest cost (LLM coaching) runs on external APIs and we pay per token. Donation-only doesn't cover that until massive scale. Also: Lichess took a decade of goodwill to become sustainable. You need revenue from day one.

**Why not pure freemium with gated features:**
If you gate the coaching behind payment, most people never experience the magic. The free tier must be genuinely useful — that's what creates word of mouth and viral growth. The coaching lesson cards are the shareable viral unit.

**Why $4/month:**
- Undercuts every competitor ($7.99 Aimchess, $7-30 Chessvia, €14 Noctie)
- Impulse-buy territory for chess enthusiasts
- 5% conversion at 100K users = $20K/month revenue vs ~$2K costs

**Revenue projections:**

| Users | Premium (5%) | Premium Revenue | Ad Revenue | Total Revenue | Costs |
|-------|-------------|-----------------|------------|---------------|-------|
| 1K | 50 | $200/mo | ~$50 | ~$250 | ~$80 |
| 10K | 500 | $2,000/mo | ~$500 | ~$2,500 | ~$300 |
| 100K | 5,000 | $20,000/mo | ~$1,500 | ~$21,500 | ~$1,850 |

---

## 9. Marketing & Positioning

### Brand Identity

This is NOT another "AI chess tool." This is a chess coach that happens to use AI.

**Key messaging:**
- "Learn principles, not just moves"
- "Built on the training methods of Dvoretsky, Botvinnik, and the world's greatest chess coaches"
- "Think first, engine second — the way real improvement happens"
- "Your accuracy score doesn't matter. Your understanding does."
- "Every chess app tells you WHAT to play. We teach you WHY."
- "The chess coach you can't afford, for free"

**Anti-positioning (what we explicitly are NOT):**
- NOT another game review tool (we're a coaching tool that uses game review as the input)
- NOT chasing accuracy scores or gamification metrics
- NOT trying to be everything (no puzzles v1, no playing, no social features — just coaching)
- NOT ad-cluttered or scammy

### Launch Strategy

1. **r/chess and r/chessbeginners** — Post showing a real coaching lesson card from the app. The principle-based lesson format is inherently shareable and discussion-worthy.
2. **Chess YouTube/content creators** — Reach out to improvement-focused creators (the Studer audience, not the entertainment audience). The app aligns with their message.
3. **Lichess forum** — The Lichess community values free, quality tools. Position as "the Lichess of chess coaching."
4. **Shareable lesson cards** — Every lesson can be shared as an image/link. "Here's what I learned from my game today" is natural social content.

---

## 10. Development Roadmap

### Phase 1: Core Loop MVP (2-4 weeks)
- [ ] PGN paste import + interactive board (use chessground)
- [ ] Stockfish WASM analysis in browser
- [ ] Critical moment detection (top 2-3 per game)
- [ ] Position feature extraction
- [ ] LLM coaching pipeline (principle classification + lesson generation)
- [ ] Lesson card UI alongside the board
- [ ] "Think First" toggle (Socratic mode on/off)
- [ ] Clean, focused responsive design

### Phase 2: Account Sync (1-2 weeks)
- [ ] Chess.com username import via API
- [ ] Lichess username import via API
- [ ] Game selection UI (browse recent games)
- [ ] First bulk scan (diagnostic across 50 games)

### Phase 3: Accounts & Tracking (2-3 weeks)
- [ ] User accounts (email + OAuth)
- [ ] Game and lesson history
- [ ] Principle violation tracking
- [ ] Dashboard: "Your weaknesses" ranked by frequency
- [ ] Progress over time visualization

### Phase 4: Monetization (1 week)
- [ ] Ad integration (Carbon Ads / EthicalAds banner)
- [ ] Stripe for premium subscriptions
- [ ] Rate limiting on free tier (coaching sessions/day)
- [ ] Premium features unlock

### Phase 5: Polish & Growth
- [ ] Shareable lesson card images/links
- [ ] Weekly email digest for premium users
- [ ] Chrome extension for one-click import from Chess.com/Lichess
- [ ] Community stats (most commonly violated principles globally)
- [ ] Targeted practice suggestions based on weakness profile

### Future (Post-Launch)
- [ ] Puzzle training focused on YOUR weaknesses (Dvoretsky-style deliberate practice)
- [ ] Endgame position sparring (play out positions against the engine — Dvoretsky's method)
- [ ] Opening repertoire suggestions based on your playing style
- [ ] Mobile app

---

## 11. Risks & Mitigations

**Risk: LLM gives bad chess coaching advice**
Mitigation: The LLM doesn't calculate chess — Stockfish does. The LLM only explains and categorizes based on accurate engine data + extracted position features. Validate lesson quality manually for the first few hundred outputs. Build a feedback mechanism for users to flag bad lessons.

**Risk: Chessigma launches Supercoach before us**
Mitigation: They're trying to be everything. We're laser-focused on coaching quality and the think-first methodology. Speed matters — ship MVP fast.

**Risk: Chess.com blocks API access**
Mitigation: Always support PGN paste as universal fallback. Lichess API is fully open and permissive. If Chess.com blocks, Lichess users alone are a massive market.

**Risk: LLM costs spike with user growth**
Mitigation: Aggressive caching. Many positions map to the same principles. Haiku for classification (cheap), Sonnet only for novel lesson generation. Rate limit free tier.

**Risk: Users don't see value over free Lichess analysis**
Mitigation: The lesson cards ARE the differentiator. Make them beautiful, insightful, and shareable. If someone screenshots a lesson card and posts it on r/chess, we win.

**Risk: "Think First" mode feels annoying, users just want answers**
Mitigation: It's a toggle, not forced. Default to on for new users (with explanation of why). If data shows most users turn it off, reconsider the default.

---

## 12. Name Ideas

Need to check domain availability for all of these:
- **ChessCoach** — simple, direct
- **PawnSchool** — playful, memorable
- **MoveWhy** — the core question the app answers
- **BoardBrain** — catchy
- **PrincipledChess** — on the nose
- **ThinkFirst Chess** — describes the methodology
- **ChessMentor** — classic feel
- **The Chess Principle** — editorial feel
- **NextMove** — forward-looking (but generic)

---

## 13. Inspiration & References

### People
- **GM Noël Studer** — Next Level Chess blog, The Simplified Chess Improvement System. Core influence on our philosophy around accuracy scores being misleading, the leaky roof concept, and the Pareto principle applied to chess training.
- **Mark Dvoretsky** — The greatest chess trainer in history. Diagnostic method, deliberate practice, ladder technique, endgame focus.
- **Mikhail Botvinnik** — Founded the school that produced Karpov, Kasparov, Kramnik. "Annotate your own games before checking the engine."
- **GM Artur Yusupov** — Dvoretsky's star pupil. Critical moments methodology, game analysis framework.
- **GM R.B. Ramesh** — Indian school of chess training. Emphasis on thinking process over memorization. "Knowing is NOT doing."
- **GM Avetik Grigoryan (ChessMood)** — Study → Practice → Fix → Repeat, multiplied by mindset.

### Architecture
- **Lichess** — Written in Scala 3, TypeScript frontend, MongoDB, Redis for WebSockets, Stockfish WASM client-side, Rust services for heavy lifting. 59K lines of backend code across 69 modules. Runs on ~$5K/month servers. Open source.
- YouTube: How Lichess was made (architecture deep dive)
- YouTube: Lichess efficiency and technical decisions

### Key Articles
- Studer: "What Accuracy Score Is Good In Chess?" — nextlevelchess.com/accuracy-score/
- Dvoretsky: "3 Effective Training Methods" — thechessworld.com
- Yusupov: "Analyzing Your Own Chess Games" — thechessworld.com
- "What Every Chess School Got Right: 5 Training Methods for Adult Improvers" — chesschatter.substack.com
