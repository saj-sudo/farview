# Changelog

All notable changes to Farview are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-08-29

### Added

- **Two-level lanes: pillars and areas.** Both grouping levels can now be
  mapped, and each one can either follow a tag **collection** — the space's own
  list, so lanes appear as you add tags to it — or use tags picked by hand in
  lane order. Every (pillar, area) pair becomes its own lane; a repeated area
  name under two pillars stays two lanes.
- Sub-lanes indent under their pillar, which names itself once per run, and
  **inherit the pillar's color** so a pillar reads as one block down the page.
- Lane order is configured-first, then alphabetical, with untagged lanes last
  within their pillar and the ungrouped lane last of all.

## [0.3.0] — 2026-08-26

### Added

- **Item detail pages** — click into any goal or project (`#/item?id=…`, linked
  from every card) for its own mini-timeline: the item's bar, its linked
  projects and actions in their own lanes, milestone ticks, a breadcrumb up to
  its goal, navigable children lists, and fact rollups ("1 of 3 actions done ·
  2 of 4 projects completed" — counts, never percents).
- **Mapped relations** (all optional, resolved by name like everything else):
  a project's goal link, actions on projects and goals, and milestone markers
  on goals. The new actions level can point at Capacities' built-in Tasks or
  any custom type — or stay unmapped and invisible.
- **Derived spans**: an undated goal or project with dated children borrows
  their envelope as a dashed shell on the main timeline — labeled as derived,
  never filled, never "overdue", gone once a real date is set. Horizon columns
  bucket by the derived date instead of Someday.
- With editing on, detail pages create **pre-linked children**: a new project
  sets its goal at birth; a new action is appended to the parent's actions
  property right after creation.
- Horizons goal-grouping now prefers real goal links over the shared-group
  fallback; the Saltmarsh demo gained Deck Chores and a fully linked hierarchy.

## [0.2.0] — 2026-08-25

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
  writes only behind an explicit opt-in and a user gesture" — documented in
  the README and CONTRIBUTING, guarded by the scope tests.

## [0.1.0] — 2026-08-25

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
  and progressive rendering — the axis paints before the first object lands.
- Milestones as a lazy, opt-in enhancement: entity-referenced objects are
  fetched when a card is expanded and drawn as tick marks along the bar.
- Someday tray for undated items, agenda list for narrow viewports, keyboard
  navigation (pan, zoom, walk items), reduced-motion support, and empty
  states for unmapped, undated, and empty spaces.
- Synthetic fixture spaces — the Saltmarsh Boatyard (deliberately alien
  schema), a minimal space, and an empty space — doubling as demo data and
  the test seam for the engine and pipeline suites.
- Strict CSP on every page, enforced by a build test; MIT license; landing
  page and documentation.
