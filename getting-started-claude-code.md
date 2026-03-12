# DeepMove — Getting Started with Claude Code

## Before You Start

### Files from this planning session

You have these files to bring into the project:
1. **deepmove-CLAUDE.md** → rename to `CLAUDE.md` and place at project root
2. **chess-coach-product-spec-v2.md** → place in `docs/product-spec.md`
3. **feature-extraction.md** → place in `docs/feature-extraction.md`

The CLAUDE.md is the most important one. Claude Code reads it automatically at the start of every session.

## Step-by-Step Project Setup

### 1. Create the project and initialize git

```bash
mkdir deepmove
cd deepmove
git init
```

### 2. Place your CLAUDE.md at the root

```bash
# Copy or create CLAUDE.md at the project root
# This is what Claude Code reads to understand the project
```

### 3. Tell Claude Code to scaffold the project

Your first prompt to Claude Code should be:

```
Read the CLAUDE.md file. Then scaffold the DeepMove project:
1. Create the full directory structure as specified
2. Set up the frontend with React + TypeScript + Vite
3. Set up the backend with Python + FastAPI
4. Create docker-compose.yml for PostgreSQL + Redis
5. Create .env.example with all required variables
6. Create .gitignore
7. Create the Makefile with common dev commands
8. Install chessground and chess.js in the frontend
9. Don't build any features yet — just the skeleton with placeholder files
```

### 4. Build Track A and B in parallel

After scaffolding, work in focused sessions:

**Session 2: Get the board rendering**
```
Set up chessground to render an interactive chess board.
Create a simple page where I can paste a FEN and see it on the board.
Use the chessground library that Lichess uses.
```

**Session 3: PGN loading and move navigation**
```
Integrate chess.js to parse PGN. When I paste a PGN, load the game
and let me click through moves with the board updating.
Add a move list component with clickable moves.
```

**Session 4: Stockfish WASM**
```
Integrate Stockfish WASM to run in the browser.
After loading a game, analyze each position and show evaluations.
Add an eval bar alongside the board that updates as I step through moves.
```

**Session 5: Start feature extraction (parallel with board work)**
```
Read docs/feature-extraction.md. Build the material counter and
game phase detector. Write comprehensive tests for both using
known chess positions.
```

And so on, following the build order in CLAUDE.md.

## Best Practices for Managing a Large Claude Code Project

### 1. Keep CLAUDE.md as the single source of truth

Every major decision goes in CLAUDE.md. When you decide something new (like "we're using Zustand for state management"), update CLAUDE.md. Claude Code reads this at the start of every conversation, so it always has the full context.

### 2. Work in focused sessions

Don't try to build the whole app in one session. Each Claude Code session should have ONE clear goal:
- "Get chessground rendering with a FEN input"
- "Build the pawn structure analyzer with tests"
- "Wire up the Chess.com API to fetch games"

Claude Code works best when it knows exactly what you want.

### 3. Use the docs/ folder as project memory

Create docs for things Claude Code needs to reference:
- `docs/decisions.md` — Architecture Decision Records. Every time you make a significant choice, log it: "2026-03-12: Chose hybrid architecture because pure LLM coaching produces hallucinated chess analysis"
- `docs/coaching-prompts.md` — All LLM prompt templates. Iterate on these and save the versions that work.
- `docs/principle-taxonomy.md` — The full principle catalog. Build this as you go.
- `docs/elo-coaching-guide.md` — What to teach at each Elo level.

### 4. Test the chess code rigorously

The feature extraction is the foundation of coaching quality. Every extractor needs tests:

```
Write tests for the pawn structure analyzer. Use these known positions:
- Starting position (FEN): should have no weaknesses
- French structure (FEN): should detect White's space advantage and locked center
- Carlsbad structure (FEN): should detect semi-open c-file
- Position with isolated d-pawn (FEN): should detect the isolani
Include at least 10 test positions.
```

### 5. Validate coaching quality early and often

After building the feature extraction + classifier + LLM pipeline:

```
Pull my 5 most recent games from Chess.com (moosetheman123).
Run each through the full coaching pipeline.
Show me the coaching output for every critical moment detected.
I will evaluate whether the lessons are good.
```

If the output isn't good, iterate on:
1. Feature extraction (is it detecting the right things?)
2. Principle classification (is it mapping to the right principle?)
3. LLM prompts (is it explaining the concept well?)

### 6. Commit often with meaningful messages

```bash
git add -A && git commit -m "feat: pawn structure analyzer with 15 test cases"
git add -A && git commit -m "feat: critical moment detection from Stockfish eval swings"
git add -A && git commit -m "fix: king safety scorer not detecting uncastled king as dangerous"
```

### 7. Use branches for major features

```bash
git checkout -b feature/stockfish-wasm
# ... build stockfish integration ...
git checkout main && git merge feature/stockfish-wasm
```

### 8. Keep a running list of what works and what doesn't

Create a `docs/iteration-log.md`:
```markdown
## 2026-03-12
- Tested coaching on game vs 1400 opponent
- Feature extraction correctly identified hanging bishop
- Principle classifier mapped to "Blunder Check"
- LLM lesson was too generic — needs more specific reference to the position
- TODO: Add the specific squares and pieces to the LLM prompt
```

## Your First Claude Code Session

Open Claude Code in the deepmove directory and say:

```
I'm building DeepMove, a chess coaching web app. Read the CLAUDE.md
file at the project root — it contains the complete project spec,
architecture, and build plan.

For this session, I want to scaffold the entire project structure.
Create all directories and placeholder files as specified in CLAUDE.md.
Set up:
1. Frontend: React + TypeScript + Vite with chessground and chess.js
2. Backend: Python + FastAPI skeleton
3. Docker compose for PostgreSQL and Redis
4. All config files (.env.example, .gitignore, Makefile, tsconfig, etc.)

Don't build any features yet. Just the clean skeleton so we have
a solid foundation to build on.
```

## Important Notes

### Domain
Working name: DeepMove. Need to secure deepmove.io or similar. Check availability.

### Competitors to be aware of
- **Chessigma** — #1 competitor. 1.1M monthly visits. Free game review. AI Supercoach on waitlist (not launched yet). Cluttered UX, meme branding.
- **Sensei Chess** — Free AI coaching platform. Decent features but vibe-coded UI.
- **Chessvia AI** — Voice-enabled AI coach. $7-30/mo. Good UX but expensive.
- **Aimchess** — Owned by Chess.com/Play Magnus. Skill analytics. $7.99/mo.

### Open source plan
Launch closed source. Plan to open source non-AI parts (board, analysis, game import) in 6-12 months once we have traction. Keep coaching prompts and principle classifier proprietary. Use AGPL license (like Lichess) for open parts.

### Revenue model
Free with single tasteful banner ad + $4/mo premium (may raise to $6-8 later). Free tier includes full game review + coaching. Premium adds ongoing tracking, bulk scans, weekly summaries, ad removal.
