# Upstream Issues Status

Quick-reference tracking for the 80 actionable issues from `UPSTREAM_ISSUES.md`.
Last updated: 2026-03-07

---

## BATCH 1: Easy Bug Fixes — ✅ ALL DONE (9/9)

| # | Title | Status | Commit |
|---|---|---|---|
| #659 | Compilation warnings | ✅ Fixed | 139d40d2 |
| #697 | Edge coordinates on wrong side | ✅ Fixed | 4a30e3ba |
| #698 | Flip board resets coordinate mode | ✅ Fixed | 4a30e3ba |
| #316 | Can't castle via text move input | ✅ Fixed | 610be907 |
| #185 | Partial position resets on tab switch | ✅ Fixed | 848cc79d |
| #319 | PGN multiple comments dropped | ✅ Fixed | a9bd84a4 |
| #539 | UI layout issues at narrow widths | ✅ Fixed | de638255 |
| #690 | Duplicate options error in Board | ✅ Fixed | c205bc11 |
| #634 | Players/tournaments stale after delete | ✅ Fixed | c14d2be4 |

---

## BATCH 2: Moderate Bug Fixes — ✅ ALL DONE (9/9)

| # | Title | Status | Commit |
|---|---|---|---|
| #670 | Engine settings reset on tab switch | ✅ Fixed | ea05836a |
| #633 | Practice mode arrows bypass drill line | ✅ Fixed | 173aab30 |
| #500 | "No analysis available" with valid UCI | ✅ Fixed | 50131f75 |
| #569 | Reference DB empty after pawn promotion | ✅ Fixed | 16f70902 |
| #580 | Puzzle database workflow broken | ✅ Fixed | 55fe9bfc |
| #163 | UCI `ucinewgame` not sent on game switch | ✅ Fixed | 54dd350a |
| #673 | Games from position ordered by date, not Elo | ✅ Fixed | 9b077f00 |
| #418 | Error saving game to database | ✅ Fixed | 292544cc |
| #707 | Lichess database JSON syntax error | ✅ Fixed | f73d17ca |

---

## BATCH 3: Hard Bug Fixes — ✅ MOSTLY DONE (2/3)

| # | Title | Status | Notes |
|---|---|---|---|
| #530 | Laggy board UI while engine runs | ✅ Fixed | Commits 1a6a4395 (Rust-side buffered events) + 203daa21 (React O(1) selector) |
| #631 | Animation stutter in analysis (Tauri 2) | ✅ Fixed | Commit 203daa21 (port of upstream PR #725, O(1) React selectors) |
| #487 | Every bug so far (omnibus) | ⬜ Open | Multi-issue bundle; mostly Windows timing/crash issues |

---

## BATCH 4: Easy Enhancements — 3 DONE (3/14)

| # | Title | Relevance | Status |
|---|---|---|---|
| #254 | Arrow keys navigate tabs instead of moves | High | ✅ Fixed |
| #301 | Allow up to 8 analysis lines (not just 5) | High | ✅ Fixed |
| #495 | Auto-start engine on new analysis board | High | ✅ Fixed |
| #510 | Copy engine output to clipboard | High | ✅ Fixed |
| #534 | Save engine line without jumping to position | High | ⬜ Open |
| #708 | Support PGN `[%timestamp]` syntax | High | ✅ Fixed |
| #393 | Option to download unrated Lichess games | Medium | ✅ Fixed |
| #266 | Open analysis in new tab from Play Chess | Medium | ⬜ Open |
| #516 | Option to suppress `.info` sidecar files | Medium | ⬜ Open |
| #682 | Arrows for variation moves on board | Medium | ⬜ Open |
| #672 | Credit authors in database download list | Medium | ⬜ Open |
| #565 | Time editor in PGN editor | Low | ⬜ Open |
| #566 | Invert/swap sides in board editor | Low | ⬜ Open |
| #413 | Spanish translation | Low | ⬜ Open |

---

## BATCH 5: Moderate Enhancements — ⬜ ALL OPEN (0/24)

| # | Title | Relevance | Status |
|---|---|---|---|
| #191 | Add/update game in personal database | High | ⬜ Open |
| #252 | Save report annotations back to database | High | ⬜ Open |
| #263 | Navigate variations with popup selector | High | ⬜ Open |
| #306 | Practice mode drills full lines | High | ⬜ Open |
| #445 | Inline notation improvements (omnibus) | High | ⬜ Open |
| #251 | More keyboard shortcuts (omnibus) | High | ⬜ Open |
| #637 | Live move annotations during analysis | High | ⬜ Open |
| #591 | UX improvements for repertoire building | High | ⬜ Open |
| #558 | Adjustable engine strength / ELO | High | ⬜ Open |
| #246 | Real-time move classification | High | ⬜ Open |
| #256 | DB search: both players, scrollable, piece contrast | High | ⬜ Open |
| #540 | UI at small window widths (vertical layout) | Medium | ⬜ Open |
| #527 | Drag-to-reorder games in a file | Medium | ⬜ Open |
| #442 | Game notation like Lichess (vertical) | Medium | ⬜ Open |
| #282 | Color-coding for variations and comments | Medium | ⬜ Open |
| #208 | Engine UX improvements (click to start, metrics) | Medium | ⬜ Open |
| #201 | Sort by time control in database | Medium | ⬜ Open |
| #186 | Multiple reference databases | Medium | ⬜ Open |
| #243 | Continuous/infinite scroll game list | Medium | ⬜ Open |
| #226 | Combine/merge multiple databases | Medium | ⬜ Open |
| #372 | Import casual/unrated Lichess games | Medium | ⬜ Open |
| #211 | Filter games by type/date on import | Medium | ⬜ Open |
| #307 | Auto-sync accounts, save report settings | Medium | ⬜ Open |

---

## BATCH 6: Large Enhancements — ⬜ ALL OPEN (0/22)

| # | Title | Relevance | Status |
|---|---|---|---|
| #47 | Local puzzle databases | High | ⬜ Open |
| #191 | Add/update game in personal database | High | ⬜ Open |
| #339 | Split view: Analysis + Database side by side | High | ⬜ Open |
| #449 | Bulk game analysis / game report | High | ⬜ Open |
| #453 | Woodpecker / spaced repetition puzzles | High | ⬜ Open |
| #536 | Mass review of games | High | ⬜ Open |
| #432 | Personal puzzles from own mistakes | High | ⬜ Open |
| #360 | Generate puzzles from imported games | High | ⬜ Open |
| #616 | Show eval scores on analysis arrows | High | ⬜ Open |
| #556 | Advanced search and filters | High | ⬜ Open |
| #607 | Integrate Maia 2 | High | ⬜ Open |
| #72 | Game report improvements (omnibus) | High | ⬜ Open |
| #11 | Issues and features (omnibus) | High | ⬜ Open |
| #686 | Generate puzzles from Lichess handle | Medium | ⬜ Open |
| #335 | Move score overlays on board squares | Medium | ⬜ Open |
| #559 | AI move explanation + TTS | Medium | ⬜ Open |
| #253 | Detect duplicate games | Medium | ⬜ Open |
| #250 | Player opening statistics | Medium | ⬜ Open |
| #378 | Best move + eval bar smoothing | Medium | ⬜ Open |
| #329 | Import from ChessGames.com | Low | ⬜ Open |
| #277 | Plugin API | Low | ⬜ Open |
| #278 | User profiles | Low | ⬜ Open |
| #1 | Chess variants | Low | ⬜ Open |

---

## Summary

| Batch | Total | Done | Open |
|---|---|---|---|
| BATCH 1: Easy Bug Fixes | 9 | **9** ✅ | 0 |
| BATCH 2: Moderate Bug Fixes | 9 | **9** ✅ | 0 |
| BATCH 3: Hard Bug Fixes | 3 | **2** ✅ | 1 |
| BATCH 4: Easy Enhancements | 14 | **4** ✅ | 10 |
| BATCH 5: Moderate Enhancements | 23 | 0 | **23** |
| BATCH 6: Large Enhancements | 23 | 0 | **23** |
| **TOTAL** | **81** | **24** | **57** |

**24 issues resolved. 57 remaining.**

Next highest-impact targets (quick wins from Batch 4):
1. **#534** — Save engine line without navigating there
2. **#266** — Open analysis in new tab from Play Chess
3. **#516** — Option to suppress `.info` sidecar files
4. **#682** — Arrows for variation moves on board
5. **#672** — Credit authors in database download list
