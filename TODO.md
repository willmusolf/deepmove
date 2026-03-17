# DeepMove Development TODO

**Current Status**: Board logic ✅ complete. Chess mechanics (branching, navigation, board sync) confirmed correct and tested. Coach integration is the next major push.

**Launch Target**: Complete product with coaching, accounts, and mobile compatibility.

**Last Session**: Audit round 4 — memoized GameReport stats + PlayerInfoBox material calc, fixed PGN nesting bug, debounced EvalGraph ResizeObserver, added Vite chunk splitting, wired userElo from game metadata, stable React keys. All 78 tests pass.

**Audit Rounds Completed**: 4 (branch collision, GameReport O(n²), memoization/dedup, perf round 4)

---

## 🔴 CRITICAL PATH (DO THESE FIRST)

### TRACK A.2: Player Info Boxes (Session: 2-3 hours) — **MVP**
**Status**: 🔄 BLOCKED on board freeze fix (low priority but blocks layout)
**Why**: Essential visual context. Copy Chessigma exactly.

**What we know:**
- Layout: white player box above board, black box below
- Display: username, rating (1376), flag, time-at-move, pieces captured, material advantage (+5)
- Time-at-move comes from PGN move timestamp, not current clock
- Boxes have dark background, fixed positioning, professional styling

**Todo:**
- [ ] Create `PlayerInfoBox.tsx` component (reusable for white/black)
- [ ] Extract PGN headers (White, WhiteElo, Black, BlackElo, etc.)
- [ ] Compute pieces captured + material difference at current move
- [ ] Extract move timestamp from PGN
- [ ] Style to match Chessigma (check chessigma.com source for exact colors/layout)
- [ ] Test responsive (stack on mobile)
- its done, check what we did, but make it better and make it look much better i have more suggestions:
-MAJOR PLAYER BOX EVALUTAITON OVERHUAL
-its asymmetrical ugly and not fleshed out properly with the correct details
-fix pieces taken not showign up properly
-fix sides/user/profile pics not loading for the correct side
-add time and dateand info of when the game was played?somewhere above game transcript or something? small idk where to put it maybe not necessary for an laready loaded game? or we can highlight which game is loaded if they go back into load where the date and stuff already is? in the game list / load section it has that info instead
-for pieces taken and points advantage and how much time each person had when they made the move this all needs to look better. we want the info in the player box to be better presented tighter overall more connected to the board maybe a box holding the usernames and info and such AND the board? something cleaner and more polished and professional in line with the ui feel free to ask questions
-we also want to make the board bigger take up more space to the right and make the analsysi/load/coach area samller (move the left side of that load analsyis container to the right) and make the board bigger
Add Move Timestamps for when each move happened the clock has the time of when it occured
-also for hte load section:
-something to think about: chess.com only pulls games from the most recent month. possible workaorund? or way to pull more games?
-auto laoding chess games for usernmae typed into load for some reason? make user press enter? or no bc usually its only one account
-add something to make it so the user can say thats their username after they search it and we know its them? and they can search other accounts or something for other websites? need to flesh the idea out they still should be able to search and analyze for other accounts
 -give more space to the laod section? or have usernames on top of each other? look at chessigma for inspiration. currnetly the names are getting cut off most of the time. i can include a screenshot if you want
 - a lot of those are unrealted. we can split that up into an updated better formatted todo in this file then split it up among sessions. ask questions to flesh it out and figure it out further
 - and so eval bar will be in the player / board box


### TRACK A.3: Wire Board Layout (Session: 1-2 hours) — **MVP**
**Status**: ⏸️ BLOCKED on A.1 + A.2
**Why**: Board needs proper container structure before adding coach panel.

**Todo:**
- [ ] Fix ResponsiveLayout (desktop: board center, player boxes above/below; mobile: full width)
- [ ] Board stays centered + navigable
- [ ] Player boxes visible on mobile (maybe smaller text or horizontally scrolling)
- [ ] Make board bigger (+20% from current)
- [ ] Verify no weird jumping/shifting

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
