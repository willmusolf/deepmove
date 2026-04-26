# DeepMove Openings / Repertoire Trainer Spec

Extracted from TODO.md. This is the full product spec for the Practice > Openings feature.

---

## Product Vision

**What Chessreps is:** an opening trainer centered on courses/lines + spaced repetition. Core loop: pick an opening, learn the line, get quizzed from the resulting positions, repeat until recall is automatic.

**DeepMove angle:** same core opening-reps job for free, but with cleaner UI, faster board feel, better progress tracking, and tighter integration with the rest of the app.

**Stance:** base opening reps stays free (user-acquisition + retention). Premium can add private imports, deeper personalization, advanced prep.

---

## V1: Free, Structured, Specific-Line Training

- Add `Practice > Openings`
- Interaction intentionally close to Chessreps: user sees a position and must play the specific repertoire move
- If user plays acceptable-but-non-target move: "playable, but in this course we want to know X"
- Support both `Learn` and `Practice` modes:
  - `Learn`: reveal the line move-by-move with a short explanation
  - `Practice`: hide the answer, require recall from the position
- Chessreps progression pattern:
  - each opening = a course with a clear line count
  - `Learn` comes first; `Practice` unlocks after discovery/mastery
  - `Drill` / `Timed` / extras for later
- Short explanations on every move in `Learn` mode, extra emphasis on branch points and common mistakes
- Track mastery per line and per position, not just per opening
- Allow studying from either side: White repertoires and Black defenses/counters
- Start with authored public repertoires only; no user-created/private PGN import in V1

---

## V1 Launch Course Slate (commit to this)

Target: **~220–300 authored lines, 20 courses**. Rule for splitting: if users commonly search the branch by name (e.g. "Fried Liver"), let it be its own course.

### White Repertoires (10 courses)

| # | Course | Chapters | Target Lines |
|---|--------|----------|--------------|
| 1 | Italian Game | Giuoco Piano, Two Knights, early ...Bc5, anti-Fried-Liver | 14–18 |
| 2 | Scotch Game | Main Scotch, ...Bc5 setups, ...Nf6 setups | 10–14 |
| 3 | Fried Liver Attack | Main attack, safer fallback if Black declines, traps | 8–12 |
| 4 | Vienna Game | Quiet Vienna systems, Vienna with Bc4, anti-...Nf6 basics | 10–14 |
| 5 | Vienna Gambit | Accepted, declined, common sidesteps | 8–12 |
| 6 | Queen's Gambit | vs QGD, vs Slav, vs QGA, simple development setups | 12–16 |
| 7 | London System | Classic London, ...Bf5 lines, ...c5 pressure, kingside attack basics | 12–16 |
| 8 | Jobava London | Core setup, ...e6 lines, ...g6 lines, early tactical themes | 10–14 |
| 9 | English Opening | Reversed Sicilian structures, ...e5 response, ...c5 symmetry, kingside fianchetto | 10–14 |
| 10 | King's Gambit | Accepted, declined, simple recovery plans, common tactical motifs | 8–12 |

### Black Defenses (10 courses)

| # | Course | Chapters | Target Lines |
|---|--------|----------|--------------|
| 1 | Caro-Kann | Advance, Exchange, Classical/Two Knights, Panov basics | 14–18 |
| 2 | Sicilian | Open Sicilian basics, Alapin, Closed/Grand Prix, Smith-Morra | 14–18 |
| 3 | Scandinavian | ...Qxd5, ...Qa5, Icelandic-style sideline awareness | 10–14 |
| 4 | French | Advance, Exchange, Tarrasch, simple development vs sidelines | 12–16 |
| 5 | Petrov | Mainline Petrov, early d4 systems, quiet anti-Petrov tries | 8–12 |
| 6 | Pirc / Modern | Austrian Attack basics, classical development, Bg5/Be3 setups | 10–14 |
| 7 | Queen's Gambit Declined | Main setup, Exchange structure, London-transpose awareness, minority-attack defense | 12–16 |
| 8 | Slav | Main Slav, Exchange Slav, early Nc3/Nf3 branches, Semi-Slav awareness | 12–16 |
| 9 | King's Indian | Classical setup, London/Catalan-style anti-KID, basic kingside attack | 12–16 |
| 10 | Dutch Defense | Stonewall basics, Leningrad basics, anti-Staunton awareness, attacking plans | 10–14 |

---

## V1.5: Better Than Chessreps

- `Drill` mode: fast consecutive position recall with streaks and fail/retry
- `Timed` mode: same reps but with a clock
- Better visuals: opening cards, progress rings, mastery heatmap, recently missed lines
- `Play From Here`: spawn a bot game from a repertoire position after the trained book move

---

## Spaced Repetition / Personalization

- Review scheduler: `new`, `learning`, `review`, `mastered` states per line
- Store per-position recall stats: attempts, misses, last_seen_at, next_review_at, streak
- Later: use recent reviewed games to recommend which openings to study
- Later: "anti-blunder opening packs" from recurring opening mistakes in real games

---

## Data / Content Model

Entities: `repertoire`, `chapter`, `line`, `line_position`, `user_line_progress`

Each node: FEN + expected move + side to move + tags (`opening`, `gambit`, `defense`, `trap`, `mainline`, `sideline`)

Content sourcing rule: write our own course text/structure; use public-domain chess knowledge where helpful; engine-check lines for sanity; **do not copy proprietary course text/UI assets from competitors**.

---

## Recommended Build Order

1. Define the opening-course JSON/content format first (`course`, `chapter`, `line`, `position`, `explanation`, `acceptedMoves`, `targetMove`)
2. Author one complete pilot course end-to-end (`Italian Game`) before building the whole library
3. Build `Practice` shell + `Openings` course list page using mocked/pilot content
4. Build `Learn` mode first; make sure move-by-move explanations feel smooth
5. Build `Practice` mode second with exact-move checking + acceptable-move feedback
6. Add basic progress persistence and per-line mastery
7. Only then expand from 1 pilot course to the full 20-course launch slate

## Immediate Next Steps (when starting this feature)

- Rebuild the current Practice prototype inside the shared Review / Play layout system
- Add a `practiceStore` for selected course, selected line, current step, and mastery/progress persistence
- Finish the Italian pilot to the target 14–18 lines before authoring Scotch / Vienna / Queen's Gambit
- Add a tiny authoring checklist so every line has: target move, acceptable alternatives, explanation, and sanity-checked legality
- Only after the shell feels native: add course progress UI and then expand the opening library

---

## Premium Later (not MVP)

- Import PGN/Chessable-style repertoires into a personal library
- AI-generated personal opening prep from your recent games
- Private repertoire builder + sharing
- Advanced prep dashboards and deeper personalization
- Deep scan recent 100–200 games to recommend openings, defenses, and recurring tactical themes
