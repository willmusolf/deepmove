# DeepMove Development TODO

**Current Status**: Board logic ~95% functional. **Board freeze bug identified and instrumented with diagnostics.** Coach integration is next major push (prerequisite: confirm board freeze fix works).

**Launch Target**: Complete product with coaching, accounts, and mobile compatibility.

**Last Session**: Added comprehensive logging to debug board freeze on go-back-1-move scenario. Ready to test and collect console output.

---

## 🔴 CRITICAL PATH (DO THESE FIRST)

### TRACK A.1: Fix Board Freezing Bug (Session: 1-2 hours)
**Status**: ✅ Diagnostics added, 🔄 NEEDS TESTING
**Why first**: Breaks user experience on certain games. Must be stable before coaching.

**What was done:**
- Added null-safety check in `addVariationMove` to warn if parent node missing
- Added detailed console logging at 3 key points:
  - `goBack()`: logs path before/after
  - `addVariationMove()`: logs variable state + tree updates
  - `handleBoardMove()`: logs whether advancing main line or creating branch
- Problem identified: off-by-one in move tree when going back 1 move prevents branching

**Next steps:**
- [ ] Run frontend, open browser console
- [ ] Load a game, play forward 3+ moves
- [ ] Go back exactly 1 move
- [ ] Try to make a different move (branch)
- [ ] **Screenshot console output** + send back
- [ ] Logs will show exact failure point
- [ ] Fix identified issue + test on 5+ complex games

-we can look at lichess or chessigma for this logic maybe? they have perfect game review mechanics. analyze them thoroughly for this logic and any other fixes/improvements we will need to implement
-and also we have a ton of logging implemented for this we can remove it its not very helpful, update or change it how you deem best for getting it developed
-do a thorough audit to what we have now and the simplest possible way to implement all this with everything considered. 

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



**random from will**
- load should be to the left of analysis?
- loading still extremely slow compared to lichess analysis board / chessigma game review
- making a bunch of tests next?
- TODO from notes:
 
lets do a slight claude.md /memory.md cleanup and improvement? 
sclaing / pricing plan?


branching odesnt always happen, double first branch not working, soemtimes chess board is loced can we figure out all reasons why it gets locked i dont like it getting locked


-add sounds i want thme to be the most satisfying best sounds. and a toggle. look at all the sounds chess.com makes and lichess and we can decide what to add and freom where. chessigma also has good satisfying sounds
-also highlight the king red when its in check 

-maybe a toggle analysis mode? so its not automatically loading all this stuff or still alawys analzying lines ? like it can calculate best lines (best start at a higher setting probs?) it starts flashing mayn different lines as its calculating and the eval bounces around im assuming it shoulndt move and change as much? -start stockfish at a deeper setting? im open to suggestions


-our program is much muhc much slower than competitors. why is that. initial stockfish analysis loading when you load in a game is super slow.




-better graph / report. copy other websites
-close but fix annotations?



-add time and dateand info of when the game was played?somewhere above game transcript or something? small idk where to put it maybe not necessary for an laready loaded game? or we can highlight which game is loaded if they go back into load where the date and stuff already is?
-add timestamp next to date to games in lichess/ chess.com load area too?
-something to think about: chess.com only pulls games from the most recent month. possible workaorund? or way to pull more games?
-auto laoding chess games for usernmae typed into load for some reason? make user press enter? or no bc usually its only one account
-also add pieces taken and points somewhere and how much time each person had when they made the move



-make board bigger take up more space to the right and make the analsysi/load/coach area samller (move the left side of that load analsyis container to the right) and make the board bigger
-move letters on first row move to the right a little

-add something to make it so the user can just say thats their username and we know its them? and they can search other accounts or something? need to flesh the idea out



-also common openings/labeling positions etc
-when you make a move it unlocks the moves section and it starts like a new game  in default?
-bot options or manual option by default with box for elo name timer coach maybe etc
-something better for default. can go back in moves without a game loaded? and will calculate stockfish eval on the manual board?
-and have no eval by default



-alt colorways and pieces
-have similar dropdown next to move arrows as chessigma
-test FEN string
-import profile pictures
-clean up docs and repo organization
-make taking more obvious as a suggested move? slightly