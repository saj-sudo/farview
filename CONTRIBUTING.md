# Contributing to Farview

Thanks for taking a look. Farview is small on purpose, and most changes should keep it that way.

> **Disclaimer:** Farview is an independent community tool. It is not affiliated with, endorsed by, or sponsored by Capacities. Capacities is a trademark of its respective owners.

## Setup

```
npm install
npm run dev     # local dev server
npm run lint    # eslint, warnings fail
npm test        # vitest, node environment
npm run build   # typecheck + production build
npm run smoke   # after a build: the built site in Chromium
```

You don't need an OAuth client id for development. The demo mode (made-up spaces) and the personal-token path both work without one.

## Rules that count as build failures

- **Read-only by default. Every write needs the editing opt-in and a user action.** The default OAuth scope is `api:read offline_access`, and a test (`tests/auth/pkce.test.ts`) checks that the write scope is only requested through the editing opt-in. The read `Provider` interface has no write method. All writes go through the narrow `Editor` interface (`src/engine/editor.ts`), which can create an item or change its dates, and each write starts from something the user did. No background writes, and no deletes.
- **No hardcoded schema.** No user object-type id, property id or tag name appears in code. Config holds the names people see, and `src/engine/resolve.ts` is the only place names become ids. Its failure messages must name what was missing and list what the space contains. `tests/engine/resolve.test.ts` checks the message shape.
- **The engine stays pure.** Nothing under `src/engine/` may import the SDK, touch the DOM or read a clock. Today's date is always passed in, which is what lets the whole layout engine run under `environment: 'node'`.
- **Fixtures are always made up.** The Saltmarsh Boatyard and the other spaces are fiction. Never commit a real space export, even redacted (`fixtures/real/` is gitignored as a tripwire).
- **Dependencies are a security question.** The access token lives in browser storage, so there are no third-party scripts, CDN assets or analytics. Everything is bundled, and every page has a strict CSP. `tests/build/csp.test.ts` checks the authored pages and the built output.
- **Never lose an item without telling the user.** Unknown statuses stay visible, undated items go to the Someday tray, reversed dates are flagged and left as they are, and deleted objects are dropped without errors.
- **No red, no guilt.** A passed target is shown as a fact with a small marker. There is no error red in the palette and no "overdue" wording.
- **Local dates, never UTC.** All calendar maths lives in `src/engine/dates.ts` on `YYYY-MM-DD` strings. The user's timezone is used once, to work out "today".
- **No em or en dashes.** `tests/build/dashes.test.ts` fails on U+2014 or U+2013 in any tracked text file. Use a full stop, colon, comma or brackets, and "to" for ranges.

## Tests

Every change in behaviour needs a test, and features must pass against the fixture spaces in `src/providers/fixture/`: the Saltmarsh Boatyard (with type and property names unlike any real space), the minimal space and the empty space. Together they check the main promise. If something only works with the author's own schema, it doesn't work.

There are no component tests. The UI layer is kept thin, so the type checker and the fixture-driven engine tests carry most of the weight. Timeline visuals are decided in `src/engine/timeline/` so they can be tested without a DOM.

One browser check runs in CI: `npm run smoke` serves the built site, opens every page and demo view at phone and desktop size in Chromium, and fails on any console error, uncaught exception or CSP violation. It checks that pages load cleanly and nothing more. Locally it needs a build first, and Chromium from `npx playwright install chromium`.

## Conduct

Be kind, assume good intent, and remember the person on the other end of the issue is probably doing this in their spare time too.
