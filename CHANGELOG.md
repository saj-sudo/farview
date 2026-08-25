# Changelog

All notable changes to Farview are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
