# Changelog

All notable changes to Farview are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Setup that reads your space.** On the first screen, Farview now reads your
  object types and properties and offers what it found in Capacities' words:
  "Your projects are Project", with its start, target and status, which
  statuses count as active and which as done, and your goal and milestone types
  when it finds them. A standard Capacities Project type takes one tick to open
  the timeline. Names it knows start ticked, and a guess from the shape of a
  type (two dates and a status) says so and starts unticked. When it can't tell,
  or you pick "Set it up by hand", you get the form as before. The same offer
  shows at the top of Settings until it is used or skipped. Anything already
  mapped to a type your space has is left alone.
- A demo, "a first setup in a new space", shows that first screen on a space
  built like a standard Capacities Project type.
- **Drag a Someday item onto the timeline.** With editing on, items in the
  Someday tray can be dragged onto the chart. The date under the pointer shows
  as you move, and releasing sets the dates: a project starts on that day and
  runs four weeks, a goal (or a project with only a target date) gets that day
  as its target. Only dates the space lets Farview write are sent, an item
  keeps any date it already has, and Escape or releasing off the chart changes
  nothing. Phones still set dates on the card.
- **Focus on a pillar.** A row of chips above the timeline (and above the list
  on a phone) shows one pillar at a time, with the number of items in each.
  Tap a pillar to see only its lanes, its goals and its Someday items; tap it
  again or choose All to bring the rest back. Your choice is remembered in this
  browser, and the window stays where it was when you pick one. The row only
  appears when a space has two or more pillars.
- The smoke test now runs axe-core (WCAG 2.2 A and AA plus best practices) on
  the landing page and every demo view, in light and dark, at phone and desktop
  size, and checks the theme switch with the keyboard. A violation fails the
  build.
- **A real timeline on phones.** Under 720px wide, the Timeline page still
  opens as a list, which is easiest to read one item at a time. A new
  List / Timeline switch above it shows the full timeline instead: lanes,
  bars, goal flags, milestones and the today line, opening on a quarter.
  Drag sideways to move through time, use the zoom chips to change scale, and
  tap a bar for its card. Bars are taller so a finger can hit them. On a
  phone, dragging never moves a date (type dates on the card instead).
  Your choice is remembered in this browser.
- **Light, Dark or Auto.** A small switch in the sidebar (at the bottom of the
  page on a phone) lets you pick the theme. Auto still follows the phone or
  computer setting, which is what Farview did before with no way to change
  it. Your choice stays in this browser and is applied before the first
  paint, so the page doesn't flash the other theme. The browser bar colour
  follows it too.
- **Add Farview to your home screen.** The site now has a web manifest and
  app icons, so a phone or desktop browser can install it. It opens straight
  into the app, in its own window. The CSP allows the manifest
  (`manifest-src 'self'`) and still loads nothing from other origins.
- A link to farview.dev now shows a preview card (title, description and a
  picture of the demo timeline) where it's shared.
- A smoke test in CI opens the built site in Chromium at phone and desktop
  size and fails on any console error or CSP violation.

### Changed

- **The landing page is easier to scan.** Paragraphs are three sentences at
  most and parallel facts are lists. The read-only section names the scopes
  (`api:read`, `offline_access`, and `api:write` only when you turn on
  editing) and the privacy claims link to the tests that check them. A new
  section covers the phone view.
- CONTRIBUTING has a Writing section with the copy rules, which are checked by
  `tests/build/copy.test.ts` where a machine can check them. The README follows
  the same rules: shorter paragraphs, lists for parallel facts, and a section on
  the phone view.
- The token steps name the Capacities desktop app and the **API Tokens** screen,
  as Capacities' own docs do.
- The nearly empty demo space has plain project names (scrape and paint the
  hull, re-rig the dinghy) instead of names that described what they test.
- **New look.** A layout that sits comfortably next to Capacities (white and
  warm off-white surfaces, the system font, soft corners, a familiar
  sidebar) printed in two riso inks, teal and sunflower. Timeline bars
  overprint, today is a sunflower band under an ink line, and lanes read
  like Capacities object types. Dark mode follows the system setting.
- The disclaimer now stays visible in the app: in the sidebar on desktop and
  in a footer on phone. The landing page opens with printed horizon art.
- Labels inside timeline bars no longer look doubled, and form fields meet
  WCAG AA contrast for their borders.
- Without an OAuth client configured, "Try the demo" is the main action on
  the Connect screen.
- All interface text, the README and CONTRIBUTING are rewritten in plainer
  words. A test now fails the build if an em or en dash comes back.

### Fixed

- **Accessibility pass.** Axe found and this fixes: the theme switch is now a
  proper radio group (Tab lands on the selected option, arrow keys, Home and
  End move it); every page has a level-one heading and headings no longer skip
  levels; the lane source selects in Settings have names; the demo notice is a
  landmark; links in the landing page's text are underlined instead of relying
  on colour; and the two buttons under the landing intro no longer crowd each
  other on a phone. The README screenshots and link preview card are retaken
  from the current build.
- The Today button put today two thirds of the way across the window, not
  the third the page opens with. It now puts it a third in, at any zoom, so
  there is history behind the line.
- Every page under `/app/` logged a CSP violation because zod probes for
  `eval` support. zod now runs in its `jitless` mode, so the probe never
  runs.

## [0.4.0] - 2026-08-29

### Added

- **Two-level lanes: pillars and areas.** Both grouping levels can now be
  mapped, and each one can either follow a tag **collection** (the space's own
  list, so lanes appear as you add tags to it) or use tags picked by hand in
  lane order. Every (pillar, area) pair becomes its own lane; a repeated area
  name under two pillars stays two lanes.
- Sub-lanes indent under their pillar, which names itself once per run, and
  **inherit the pillar's color** so a pillar reads as one block down the page.
- Lane order is configured-first, then alphabetical, with untagged lanes last
  within their pillar and the ungrouped lane last of all.

## [0.3.0] - 2026-08-26

### Added

- **Item detail pages.** Click into any goal or project (`#/item?id=…`, linked
  from every card) for its own mini-timeline: the item's bar, its linked
  projects and actions in their own lanes, milestone ticks, a breadcrumb up to
  its goal, navigable children lists, and fact rollups ("1 of 3 actions done ·
  2 of 4 projects completed": counts, never percents).
- **Mapped relations** (all optional, resolved by name like everything else):
  a project's goal link, actions on projects and goals, and milestone markers
  on goals. The new actions level can point at Capacities' built-in Tasks or
  any custom type, or stay unmapped and invisible.
- **Derived spans**: an undated goal or project with dated children borrows
  their envelope as a dashed shell on the main timeline, labeled as derived,
  never filled, never "overdue", gone once a real date is set. Horizon columns
  bucket by the derived date instead of Someday.
- With editing on, detail pages create **pre-linked children**: a new project
  sets its goal at birth; a new action is appended to the parent's actions
  property right after creation.
- Horizons goal-grouping now prefers real goal links over the shared-group
  fallback; the Saltmarsh demo gained Deck Chores and a fully linked hierarchy.

## [0.2.0] - 2026-08-25

### Added

- **Opt-in editing.** Read-only remains the default and the consent screen
  still shows it; a separate "Connect with editing" path (or a Settings
  toggle, which reconnects) requests `api:write` and unlocks planning from
  the view: a "+ New" dialog that creates goals and projects, drag-to-move
  and edge-resize on timeline bars (day-snapped, ghost-previewed, one PATCH
  on drop, Escape cancels), bracket-key date nudges for keyboard users,
  precise date fields on every card (the mobile path), and per-column "+"
  in Horizons pre-filled inside the bucket. Edits apply optimistically,
  write through the cache, and revert with a plain notice on failure; a
  scope-insufficient 403 downgrades to read-only with a pointer to
  Settings. Every write is a direct user gesture; nothing is ever deleted.
- The strangers demo now showcases editing, entirely in-memory; the other
  demo flavors stay read-only.

### Changed

- The product rule "Farview never writes" became "read-only by default;
  writes only behind an explicit opt-in and a user gesture". It is
  documented in the README and CONTRIBUTING and guarded by the scope tests.

## [0.1.0] - 2026-08-25

### Added

- The timeline view: lanes by group, bars from start to target filled by
  elapsed time, a single full-height gradient now-line with the past under a
  veil, and zoom presets from Quarter out to a first-class Decade view where
  bars collapse to dots and year bands carry the numerals.
- The horizons view: columns by date distance (Now, Quarter, Year, Long,
  Someday), goal-grouped when a goal type is mapped, driven by the same
  dataset as the timeline.
- Onboarding-as-settings built live from the space's real types, properties,
  tags, and status vocabulary, with a live preview of the visitor's actual
  timeline before anything is saved, plus JSON export/import of the config.
- Read-only OAuth 2.1 PKCE in the browser (`api:read offline_access`, no
  client secret, endpoints from server metadata), a personal-API-token path,
  and clean recovery when access is revoked.
- The fetch pipeline for the API's summary-only list endpoints: fetch
  ceiling with load-more, IndexedDB object cache with TTL and manual
  refresh, adaptive enrichment concurrency that backs off on rate limits,
  and progressive rendering, so the axis paints before the first object lands.
- Milestones as a lazy, opt-in enhancement: entity-referenced objects are
  fetched when a card is expanded and drawn as tick marks along the bar.
- Someday tray for undated items, agenda list for narrow viewports, keyboard
  navigation (pan, zoom, walk items), reduced-motion support, and empty
  states for unmapped, undated, and empty spaces.
- Synthetic fixture spaces (the Saltmarsh Boatyard with its unfamiliar
  schema, a minimal space, and an empty space) that double as demo data and
  the test seam for the engine and pipeline suites.
- Strict CSP on every page, enforced by a build test; MIT license; landing
  page and documentation.
