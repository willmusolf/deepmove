# DeepMove Responsive Layout Spec

Extracted from TODO.md — build to this spec, not vibes.

## Breakpoints

| Range | Label |
|-------|-------|
| `<640px` | Mobile |
| `640–1023px` | Tablet |
| `1024–1279px` | Small desktop |
| `1280–1535px` | Desktop |
| `1536+px` | Wide |

---

## Layout Architecture

- Replace the current ad hoc sizing with one shared `review/play` shell: `nav` + `content`, then inside content use `board region` + `panel region`
- Stop sizing the board primarily from viewport height; board size should be driven by available content width first, with height only acting as a cap
- Give the board region a clear minimum playable size target and let secondary regions yield first
- Make every non-board region able to shrink and scroll internally without causing page-level horizontal overflow

---

## Per-Breakpoint Behavior

### Wide desktop (`1536+`)
- Keep three clear zones visible: nav, board region, panel region
- Board should feel premium-sized and visually dominant
- Review side panel can show tabs + full analysis stack comfortably
- Play mode keeps move list beside the board, not below it

### Desktop (`1280–1535`)
- Keep the two-column board + panel layout
- Collapse nonessential whitespace before shrinking the board aggressively
- Nav may stay visible only if board and panel still both look intentional; otherwise collapse nav here too
- Buttons in the board control row should wrap cleanly instead of overflowing or compressing into ugly tiny pills

### Small desktop (`1024–1279`)
- Collapse the left nav/sidebar by default in this range
- Keep the board first and the panel second
- If side-by-side still looks good, use a narrower panel with internal scrolling; if not, stack panel under board
- Review should keep tabs visible, but tab content sits below the board once the side-by-side layout stops looking clean
- Play should prioritize board + clocks + core controls, with move list allowed below
- Use a compact top header with a menu trigger when nav is collapsed, rather than spending horizontal space on a persistent sidebar ✅

### Tablet (`640–1023`)
- Use a stacked layout by default: board block first, panel block second
- Keep Analysis as the default visible tab, but never auto-switch tabs
- Player boxes stay attached to the board block and remain easy to scan
- Eval graph and move list can remain full-width below the board if side-by-side feels cramped
- Control rows should wrap into two lines cleanly when needed

### Mobile (`<640`)
- Board goes near edge-to-edge with tight page padding
- Player boxes, clocks, and board controls become compact mobile variants; prioritize board size over preserving the full desktop card layout
- Tabs remain manual; active tab content lives below the board
- Avoid horizontal scroll everywhere, including move list, import forms, filters, and time-control controls
- Touch targets should be comfortable: tabs, arrows, move nav, and action buttons must all feel thumb-usable

---

## Page-Specific Behavior

### Review page
- Keep the board/eval bar/player boxes as one visual unit across all breakpoints
- `Load / Analysis / Coach` tabs should be structurally stable so resizing does not remount or reorder them in surprising ways
- Analysis content priority order when space is tight: eval status, best lines, eval graph, move list
- Coach content should scroll within its own region rather than pushing the whole page into awkward heights
- When stacked below the board, keep analysis information in overview-first order: tabs, eval status, best lines, eval graph, then move list

### Play page
- Setup screen and in-game screen should follow the same breakpoint system, not two unrelated responsive patterns
- In game, preserve the hierarchy: board first, clocks/player boxes second, controls third, move list fourth
- Arrow/eval toggles are secondary on small screens and may wrap or sit on a second control row
- Game result banner should never cause the board column to jump unpredictably
- On tablet/small desktop, move list can stay visible below the board; on phone-sized screens, collapse it behind a clear `Moves` section to protect board space

---

## Sizing Guardrails

- Define explicit min/max widths for nav, board region, and panel region instead of relying on flex luck
- Define a board max size for wide screens and a board minimum target for small desktop/tablet before stacking occurs
- Keep move list and coach panel on internal scroll containers with predictable max heights in side-by-side mode
- Prevent duplicate "depth" or status rows from competing for the same visual slot while resizing

---

## Implementation Order

1. Introduce shared responsive shell and breakpoint tokens
2. Fix board sizing rules
3. Fix nav collapse behavior
4. Fix Review layout and overflow traps
5. Port the same system into Play
6. Run the responsive QA checklist and only then do visual polish

## QA Checklist (run before shipping UI changes)

Viewport widths to test: 320, 390, 768, 1024, 1280, 1440, ultrawide
Devices: browser responsive presets + actual iPhone + Android device
