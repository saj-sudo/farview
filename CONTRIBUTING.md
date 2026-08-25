# Contributing to Farview

Thanks for looking under the hood. Farview is small on purpose; most contributions should keep it that way.

> **Disclaimer:** Farview is an independent community tool. It is not affiliated with, endorsed by, or sponsored by Capacities. Capacities is a trademark of its respective owners.

## Setup

```
npm install
npm run dev     # local dev server
npm test        # vitest, node environment
npm run build   # typecheck + production build
```

No OAuth client id is needed for development: the demo mode (synthetic spaces) and the personal-token path both work without one.

## The rules that are treated as build failures

- **Read-only by default; every write behind an explicit opt-in AND a user gesture.** The default OAuth scope is `api:read offline_access`, and a test (`tests/auth/pkce.test.ts`) guards that the write scope is only ever requested through the explicit editing opt-in. The read `Provider` interface has no write method; all writes go through the deliberately narrow `Editor` seam (`src/engine/editor.ts`) — create an item, patch its dates — each triggered by a direct user action. No background writes, no deletes, ever.
- **No hardcoded schema.** Not one user object-type id, property id, or tag name in code. Config carries human-readable names; `src/engine/resolve.ts` is the only place names become ids, and its failure messages must name what was missing *and* list what the space contains. `tests/engine/resolve.test.ts` enforces the message shape.
- **Engine purity.** Nothing under `src/engine/` may import the SDK, touch the DOM, or read a clock. Today's date is always injected. This is what lets the entire layout engine run under `environment: 'node'`.
- **Fixtures are synthetic, always.** The Saltmarsh Boatyard and friends are fiction. Never commit a real space export, even redacted (`fixtures/real/` is gitignored as a tripwire).
- **Dependency discipline is a security requirement.** The access token lives in browser storage, so no third-party scripts, no CDN assets, no analytics — everything bundled, strict CSP on every page. `tests/build/csp.test.ts` enforces it on the authored pages and the built output.
- **Never silently lose an item.** Unknown statuses stay visible, undated items go to the Someday tray, reversed dates are flagged rather than swapped, deleted objects are pruned without errors.
- **No red, no guilt.** A passed target is a fact, marked quietly. There is no error-red in the palette and no "overdue" scolding in the copy.
- **Local dates, never UTC.** All calendar math lives in `src/engine/dates.ts` on `YYYY-MM-DD` strings; the user's timezone enters exactly once, deriving "today".

## Tests

Every behavioral change needs a test, and features must pass against the fixture spaces in `src/providers/fixture/` — the stranger's space (`Saltmarsh Boatyard`, deliberately alien names), the minimal space, and the empty space. That trio is the regression guard for the whole premise: if it only works on the author's schema, it doesn't work.

There are no component tests; the UI layer is kept thin enough that the type checker and the fixture-driven engine tests carry the weight. Timeline visuals are decided in `src/engine/timeline/` precisely so they can be asserted without a DOM.

## Conduct

Be kind, assume good intent, and remember the person on the other end of the issue is probably doing this in their spare time too.
