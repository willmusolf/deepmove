# DeepMove Development TODO

**Current Status**: Board logic ✅ complete. Chess mechanics (branching, navigation, board sync) confirmed correct and tested. Coach integration is the next major push.

**Launch Target**: Complete product with coaching, accounts, and mobile compatibility.

**Last Session**: Audit round 4 — memoized GameReport stats + PlayerInfoBox material calc, fixed PGN nesting bug, debounced EvalGraph ResizeObserver, added Vite chunk splitting, wired userElo from game metadata, stable React keys. All 78 tests pass.

**Audit Rounds Completed**: 4 (branch collision, GameReport O(n²), memoization/dedup, perf round 4)

---

## 🔴 CRITICAL PATH (DO THESE FIRST)

### TRACK A.2 + A.3: Board Layout Overhaul + Player Info Polish (Session: 3-5 hours) — **MVP NEXT**
**Status**: 🔄 IN PROGRESS — PlayerInfoBox.tsx exists but needs major visual + data overhaul
**Why**: This is what users see first. If the board area doesn't look polished and professional, nothing else matters.

#### 🔴 IMMEDIATE CONCERN: Analysis is too slow — two separate problems

**Problem 1: Sequential depth-18 loop is the main bottleneck**
- `analysis.ts` runs a sequential `await engine.analyzePosition(fen, depth)` for EVERY move.
  A 60-move game = 60 sequential depth-18 Stockfish searches. This is why it takes forever.
- **Fix A — lower depth**: Drop full-game analysis from depth 18 → 12 or 14.
  Depth 12-14 is more than sufficient to correctly classify blunders/mistakes/inaccuracies
  for sub-2000 players. The grade thresholds (10/15/50/150/300cp) don't require depth-18 precision.
  Per-position "Show Lines" stays at depth 22 — that's on-demand and fast.
- **Fix B — progressive flush**: `moveEvals` are batch-flushed at the end (useStockfish.ts line ~76).
  Instead, flush every 5 moves so the eval graph and grade badges appear progressively
  as analysis runs. Analysis FEELS instant even if total time is the same.

**Problem 2: Manual board (before any game loaded) shows no eval**
- The free-play board currently does nothing — no eval bar movement, no lines.
- Fix: wire `analyzePositionLines` to run on free-play FEN changes too, using the same
  positionCache + token pattern already in App.tsx. Raw notes mention this specifically.
- Eval bar and "Show Lines" should work identically in free-play mode.

**Problem 3 (minor): 10MB worker loads on app mount**
- StockfishEngine is initialized before any game is loaded. Low priority vs. the above.

#### Board sizing + layout
- [ ] Make board larger — shift the right panel (analysis/load) boundary left so the board gets ~20% more width
- [ ] Eval bar lives INSIDE the board column (already done), confirm it doesn't shrink the board
- [ ] Board + player boxes should feel like one unified unit, not three separate things
- [ ] On desktop: board column takes ~60% of viewport, right panel ~40%
- [ ] Verify no layout shift when analysis panel tab switches

#### Player Info Box — full overhaul
Current state: exists but asymmetrical, pieces taken not displaying correctly, avatar loading broken for correct side.

- [ ] **Pieces taken**: fix the logic — currently broken. Need to compare current FEN piece counts vs. starting counts per color, then show pieces the opponent captured FROM you (not pieces you captured). White player box shows pieces white lost. Black player box shows pieces black lost.
- [ ] **Material advantage**: show `+N` on the side that's ahead, nothing on the other. Currently shows on wrong side sometimes.
- [ ] **Avatars**: fix which profile loads for which side. The `isWhite` prop determines which API username to look up — verify this is correct end-to-end.
- [ ] **Move clock**: extract move timestamps from PGN `[%clk H:MM:SS]` comments (they're in the raw PGN before `cleanPgn` strips them). Parse them during `buildTreeFromPgn` and store on each `MoveNode`. Display the clock time for the current move in the player box. This is the "time at move" feature.
- [ ] **Visual tightening**: player boxes should feel glued to the board top/bottom edge, not floating. Reduce gap between box and board. Match Chessigma's density and proportions.
- [ ] **Symmetry**: both boxes must be identical height and width. Top box = opponent (flips with board orientation). Bottom box = user.
- [ ] **Game info strip**: instead of putting date/time IN the player box, show it as a tiny 1-line strip above the top player box: `Rapid • 10+0 • Mar 15 2025` — small, subtle, informative. Pulled from PGN headers (Event, Date, TimeControl).

#### Load section UX
- [ ] **Chess.com multi-month**: current implementation only pulls the most recent monthly archive. Fix: fetch the last 2-3 monthly archives and merge, capped at 50 games total. The archives endpoint returns a list of available months — iterate backwards.
- [ ] **Username persistence + identity**: after a user loads games for a username, show a subtle "Playing as [username]" indicator. Store their "own" username in localStorage separately from search history. Let them search any username but mark one as "me".
- [ ] **Name truncation**: usernames getting cut off — increase width of the username column or truncate with ellipsis + tooltip on hover.
- [ ] **Loaded game highlight**: when user goes back to Load tab after loading a game, highlight which game is currently loaded in the list.

#### Eval bar
- [ ] Confirm eval bar is sized correctly relative to the new larger board (should span full board height)
- [ ] `will-change: transform` on the inner fill element for GPU-composited animation

#### Known raw notes captured here (do not delete):
- eval bar will be in the player/board box ✅ already done
- load should be to the left of analysis? → keep as-is for now, revisit after coach panel
- chess.com only pulls most recent month → fixing in this session
- auto-loading games on username type → already requires Enter key, confirm still correct
- names getting cut off in load section → fix truncation

---

## � DEVELOPMENT INFRASTRUCTURE

### TRACK D.1: Testing Framework Setup (Session: 1-2 hours)
**Status**: ✅ COMPLETED
**Why**: Essential for maintaining code quality and preventing regressions.

**What was done:**
- [x] Set up Vitest + React Testing Library for frontend tests
- [x] Configured test environment with jsdom
- [x] Added ResizeObserver mock for browser API compatibility
- [x] Created initial test suite for ChessBoard component
- [x] Added tests for board rendering, turn color detection, and legal move calculation
- [x] All tests passing (3/3)

**Test coverage:**
- ChessBoard component rendering
- Chess helper functions (getTurnColor, getLegalDests)
- Browser API mocks (ResizeObserver)

**Next steps:**
- [ ] Add more component tests (EvalBar, MoveList, etc.)
- [ ] Add integration tests for game review flow
- [ ] Add backend API tests
- [ ] Set up CI/CD with test automation

---

## �🟠 NEXT PHASE (COACHING FOUNDATION)

### TRACK B.1: Validate Backend Readiness (Session: 1 hour)
**Status**: ❌ NOT STARTED (environment not set up)
**Why**: Need to verify FastAPI coaching endpoint works before building UI.

**Note**: Backend environment isn't configured (missing pip/uvicorn). Needs setup session.

**Todo:**
- [ ] Configure Python environment (venv or conda)
- [ ] Install backend dependencies
- [ ] Start: `uvicorn app.main:app --reload --port 8000`
- [ ] Try hitting `/api/coaching/lesson` endpoint with test data
- [ ] Verify LLM response structure (expect `lesson`, `confidence`, `cached`)
- [ ] Document any connection issues

### TRACK B.2: Feature Extraction Validation (Session: 2-3 hours)
**Status**: ⏸️ BLOCKED on B.1
**Why**: Catch classification bugs early via real games.

**Todo:**
- [ ] Run classifier on 5 moosetheman123 games
- [ ] Print: features extracted, principle detected, confidence score, lesson generated
- [ ] Document any suspicious outputs
- [ ] Fix obvious classifier bugs

### TRACK C.1: Build Coaching Panel UI (Session: 3-4 hours) — **MVP**
**Status**: ⏸️ BLOCKED on A.3 + B.1
**Why**: Makes coaching visible on screen. Simplest version first.

**Todo:**
- [ ] ReviewPanel: Compose board (with player boxes) + coach panel layout
- [ ] CoachPanel: Right side (desktop) / below board (mobile), fixed-width sidebar style
- [ ] LessonCard: Render 5-step lesson (hardcoded test lesson for now)
- [ ] Style to match board professionalism
- [ ] Make responsive (coach panel stacks below on mobile)

### TRACK C.2: Connect Frontend to Backend Lesson (Session: 2-3 hours) — **MVP**
**Status**: ⏸️ BLOCKED  
**Why**: Actual coaching flow. Determine if everything wires together.

**Todo:**
- [ ] Hook up CoachPanel to useCoaching hook
- [ ] When critical moment detected, fetch lesson from backend
- [ ] Render lesson in LessonCard
- [ ] Show loading state while LLM generates
- [ ] Handle errors gracefully
- [ ] Test on moosetheman123 games

### TRACK C.3: Game Summary (Session: 1-2 hours)
**Status**: ⏸️ BLOCKED
**Why**: Close the game review loop. Simple recap of critical moments.

**Todo:**
- [ ] After game finishes, show GameSummary card
- [ ] List top 2-3 critical moments + principles learned
- [ ] "Try focusing on [principle] in your next games"

---

## 🟡 POLISH & EXPANSION

### TRACK A.4: Board UX Polish (1-2 hours per item)
- [ ] Keyboard navigation (arrow keys to step, spacebar to analyze)
- [ ] Eval bar clarity (who's winning indicator)
- [ ] Move highlighting in move list
- [ ] Last import memory (localStorage)
- [ ] Branching visualization (tree view)

### TRACK T.1: Frontend Test Infrastructure (1-2 hours)
- [ ] Add unit/integration test harness (Vitest + Testing Library)
- [ ] Add test coverage for critical board logic (FEN sync, move validation, branching)
- [ ] Add CI step to run `npm test` for frontend

### TRACK C.4: Mobile Responsiveness (2-3 hours)
- [ ] Player boxes stack vertically
- [ ] Coach panel full-width below
- [ ] Board touch-friendly
- [ ] Test on real phones

### TRACK C.5: Think First Mode (Socratic) — **ITERATE LATER**
- [ ] For MVP: Just 5-step lesson (no Socratic)
- [ ] Later: Add Socratic toggle
- [ ] Later: Blunder check checklist
- [ ] Later: Hint system

---

## 🔵 FUTURE (POST-LAUNCH)

- User accounts + auth
- Game + lesson history
- Recurring pattern detection
- Weakness dashboard
- Premium tier ($4/mo)
- Ad integration
- Shareable lessons
- Chrome extension

---

## SESSION PLANNING

**Immediate (next ~4-6 hours):**
1. Test board freeze with logging — collect console output
2. Identify exact failure point from logs
3. Apply fix + validate on 5+ games
4. Build player info boxes component
5. Wire responsive layout

**Then (~6-8 hours):**
6. Set up backend environment
7. Test coaching endpoint
8. Validate feature extraction on real games
9. Build coaching panel UI
10. Connect frontend→backend

**Then (~4-6 hours):**
11. Game summary card
12. Mobile responsiveness
13. Polish + testing

**Total to MVP**: ~14-20 hours from here


---

## 📝 RAW NOTES (keep these — source of truth for future tasks)

**random from will**
- remove go back logging ✅ done
- stockfish analysis stopping after 25 moves? and no console error? or i guess its continuing but took forever to get from 25 to 27? then stopped again. full game analysis isn't really working or is incredibly slow it seems like or i have to be on the actual screen for a long time before it boots all that up it seems like
- give standard options for what to promote to when a pawn gets promoted
- load should be to the left of analysis?
- making a bunch of tests next? ✅ done

- TODO from notes:

 -if i load in a game then exit out and open up a new game it start automatically assessing each line while stockfish analyzes in the background is that right?
-i think we want that to happen each time actually i think we implemented so theres no analysis while the report is being made but i think we can make it run for each board position actually i think thats what lichess does?
-i had this related note too:
-maybe a toggle analysis mode? so its not automatically loading all this stuff or still always analyzing lines ? like it can calculate best lines (best start at a higher setting probs?) it starts flashing many different lines as its calculating and the eval bounces around im assuming it shouldn't move and change as much? -start stockfish at a deeper setting? im open to suggestions
-i think we can have it on always and they can toggle it off? doesnt interfere with the report right?
-basically lichess only analyzes if you are on the position for like .5 sec so if you flip through moves itll wait til you stop to give full analysis / change eval board and suggested moves etc
-so i think we could have that ? if we can also figure out a way to have the report be faster? so they can jump around the game assessing positions and best moves while the report is loading?
-we also need to figure out why our program (like the report generation) is much much much slower than competitors. why is that. initial stockfish analysis loading when you load in a game is super slow.
- loading still extremely slow compared to chessigma game review?
- when engine loading happens the show lines button appear and disappear for a second? something else to be figured out with the inefficient loading
- we also need a better graph / report. copy other websites like chessigma
-close but fix annotations? or maybe we get rid of annotations? need to brainstorm how to do it but needs to improve this somehow
we need to break each of these up into a few different sessions i want you to help me do that. also open to conversation / critique / analysis / suggestions so help me out here

-branching logic check ✅ done — confirmed correct

-move letters on first row move to the right a little. we want to move the text of the letters (a-h) just a few pixels to the right on each square so its more readable.

lets do a slight claude.md /memory.md cleanup and improvement?
scaling / pricing plan?

-something better for default. can go back in moves without a game loaded? and will calculate stockfish eval on the manual board?
-auto labels common openings/labeling positions etc or something? in the default game that you can mess with or in your own transcripts and links to lessons?
-bot options or manual option by default with box for elo name timer coach maybe etc
-when you make a move it unlocks the moves section and it starts like a new game in default?
-and have no eval by default? or have game analysis board that you can just mess with and see best moves and lines and evals etc like starts a new manual game or something and can reset the transcript or something

-alt colorways and pieces
-have similar dropdown next to move arrows as chessigma
-test FEN string
-clean up docs and repo organization
-make taking more obvious as a suggested move? slightly
-search box should suggest recently searched usernames? so you dont have to type it fully out each time

-COACH LOGIC TO IMPLEMENT/DISCUSS?:

Ideas behind openings like Italian
Opening / middle / endgame tactics
Drawback mistakes
Removing the guard
Opposite colored bishops and bishop coloring
Passed pawns
Recommend playing slower
