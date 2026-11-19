# Design redesign plan: Farview

Written 2026-11-18. This is the plan for Farview's part of a design pass across Saj's builds. It
holds what a review of the running app saw, what is proposed, what would move, and where the work
stands. Update the status section at the end of every sitting.

## Verdict: rework

The concept is sound and the rules are good (no red, no "overdue", no percent complete, read only
by default). The limit is the timeline's drawing and the phone layout, not polish. The view that
should be Farview's signature, the decade, does not work yet.

## What the review saw

Seen in the demo space on farview.dev and in `docs/*.png`, 2026-11-18.

- **Decade view.** One project label renders ("Re-plank the Hull"). Every other item is an
  unlabelled sliver piled on the today line. The decade starts in 2024, so about a fifth of the
  width is the past. The year numbers are ghosted and "2026" sits under the today stripe.
  See `docs/decade.png`.
- **Year view.** Labels run across the today band and over other bars. Names drawn inside pale
  bars are grey on teal and hard to read. The yellow and black today stripe is the loudest thing on
  every view and competes with the data. See `docs/timeline.png`.
- **Phone.** Six rows sit above the first bar: nav, demo banner, Chart and List switch, pillar
  chips, the "17 items placed, refreshed" line, and the zoom row. The first project bar starts at
  about 659px on an 844px screen. See `docs/phone-timeline.png`.
- **Horizons.** Five columns (Now, Quarter, Year, Long, Someday) with readable cards. It answers
  "what now, what next" faster than the chart. See `docs/horizons.png`.
- **Item detail.** "2 of 5 months elapsed" and "1 of 3 actions done" are percent complete in
  sentence form, close to the edge of the rule against it. Date inputs and "+ Action" show in a
  product that is read only by default.
- **Setup.** A checkbox card and a button. It is a form, not a reveal.
- **Demo.** Two clicks: "Try the demo" on the landing page leads to a gate with a second
  "Try the demo".
- **Identity.** System font and the same chrome as Yesteryear (sidebar, dotted demo banner, theme
  switch). The two-ink mark is the only place the brand shows. The made-up boatyard in the demo has
  more character than the interface.

## Proposal (what the mockup will show)

1. **A far view that works.** A stretched time scale: this quarter wide, next year medium, the
   decade compressed, with every item labelled and goals as tall flags with their projects hanging
   from them. This becomes the view people screenshot, and it fits the name.
   Likely files: `src/engine/timeline/{scale,layout,lanes,ticks}.ts`,
   `src/app/components/TimelineSvg.tsx`, `src/app/views/Timeline.tsx`.
2. **Labels you can read at every zoom.** Labels beside or above bars, never inside pale fills;
   collision handling in the engine; a calmer today line.
   Likely files: `src/engine/timeline/layout.ts`, `edges.ts`, `src/app/styles.css`.
3. **Phone: Horizons first.** Horizons is the default view on a phone, the six control rows become
   one row or a sheet, and navigation moves to the bottom with safe-area padding.
   Likely files: `src/app/phoneView.ts`, `src/app/App.tsx`, `src/app/components/{PillarFocus,RefreshBar}.tsx`.
4. **Setup that draws first.** Show the timeline from the detected guess, with "Looks wrong?
   Adjust" under it, in place of a form before any payoff.
   Likely files: `src/app/views/{Settings,Connect}.tsx`, `src/app/components/MappingSuggestions.tsx`.
5. **A look of its own.** Farview and Yesteryear keep shared plumbing (auth, CSP, demo mode,
   settings mapping) and stop sharing a visual language. Farview's is distance and horizon. The
   full typeface Saj chose on 2026-11-18 lands here: a self-hosted variable face, `font-src 'self'`
   added to the CSP, and `estTextWidth` in `src/engine/timeline/lanes.ts` retuned with its tests.

## What would move (each needs Saj's yes on the mockup)

- The progress fractions on item detail ("2 of 5 months elapsed", "1 of 3 actions done"): removed.
- Date inputs and "+ Action" on item detail: shown only when editing is switched on.
- The "17 items placed, refreshed just now" line: off the phone layout (pull to refresh).
- The landing page's demo link: straight into the demo, one click.
- The linear Decade zoom: replaced by the far view.

## Rules this touches

- CONTRIBUTING.md: layout decisions go through `src/engine/timeline/*` with tests; there are no
  component tests. No red, no "overdue", no percent complete. No drag editing on phones. Fixtures
  stay fictional. No new runtime dependencies.
- `tests/build/csp.test.ts` and the three HTML files if a font is added.
- `tests/build/dashes.test.ts` covers this file too: no em or en dashes.
- Changes to anything still shared with Yesteryear are mirrored there.

## Measures of success

- First content above 250px on a 390 by 844 phone (659px today).
- Every item carries a readable label at every zoom, including the far view.
- The smoke suite stays green: axe with no violations, no CSP violation, no console warning, in
  both themes at phone and desktop sizes.

## Finish items to fold into the same build

From the code audit of 2026-11-18:
- `aria-current` on the nav (`src/app/App.tsx`); a live region for load, edit and drag results
  (`RefreshBar`); `NewItemDialog` as a modal `<dialog>` (`ItemCard` stays non-modal, the smoke
  relies on it); an on-screen hint for the keyboard shortcuts.
- A CSS skeleton for "Reading the space…".
- Font sizes below the `--text-xs` token (10px, 11px, 0.68rem) raised to it.
- `viewport-fit=cover` and safe-area padding.

## Stages and status

| Stage | State | Link | Date |
|---|---|---|---|
| Review of the running app | Done | this file | 2026-11-18 |
| Mockup | Published, timeline only: today's Decade zoom beside the far view | https://claude.ai/artifact/1MkefyeDo3Ehnii4zR3TTs | 2026-11-19 |
| Saj picks a direction | Done. A: the far view as drawn, replacing Decade. Thin today line on every zoom | | 2026-11-19 |
| Build and pull request | In review | https://github.com/saj-sudo/farview/pull/15 | 2026-11-19 |
| Identity mockup (sidebar, banner, palette) | Published: Horizon and Chart room beside today's chrome. Waiting on Saj's pick | https://claude.ai/artifact/FcLccUWjmVpTjTqxLJo4S6 | 2026-11-19 |
| Identity build | Waiting on the identity mockup | | |

Notes from the build, 2026-11-19:

- Typeface: Instrument Sans, self-hosted, picked in the build at Saj's request. Swap it at the
  identity mockup if it is wrong.
- First content on a 390 by 844 phone: 105px on Horizons, 146px to the chart and 176px to the
  first item on the timeline (424px and 650px before).
- Date inputs and "+ Action" on item detail were already shown only with editing on. The demo
  runs with editing on, which is why the review saw them.
- Shared with Yesteryear and not mirrored from here: `font-src 'self'` in the CSP,
  `viewport-fit=cover`, and the landing page's `/app/#demo` link.

## Starting a session on this build

Paste this into a fresh session that has this repository attached:

> Read `docs/design-redesign-plan.md` and `CONTRIBUTING.md` in this repo. We are doing the next
> open stage in the plan's status table, and only that stage. If the stage is the mockup: run the
> demo space, capture today's screens at 390 by 844 and 1440 by 900, and publish a mockup page that
> shows today's screens beside the proposed ones, with the "what would move" list, then stop for
> my pick. If the stage is the build: build what I picked, keep every rule in CONTRIBUTING.md, check
> the measures of success, open a pull request with before and after screenshots, and update the
> status table.
