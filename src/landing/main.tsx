import { render } from 'preact';
import timelineShot from '../../docs/timeline.png';
import decadeShot from '../../docs/decade.png';

/**
 * The landing page. Rendered with Preact so screenshots are fingerprinted
 * Vite assets; the copy leads with the reader's problem and the read-only
 * promise, because that is the whole trust decision.
 */

function Landing() {
  return (
    <main class="landing">
      <h1>Farview</h1>
      <p class="tagline">See your goals across time, in Capacities.</p>
      <p>
        Your notes know what you are building — but notes have no horizon.
        Farview lays your projects and goals out on a timeline: a line for
        today, bars stretching toward their targets, and one smooth zoom from
        this quarter to the shape of your decade. No canvas to arrange, no
        project manager to migrate into, nothing to duplicate.
      </p>
      <p>
        <a class="cta" href="/app/">
          Open Farview
        </a>
        <a class="cta-secondary" href="/app/">
          Try the demo — no account needed
        </a>
      </p>
      <img
        src={timelineShot}
        alt="The Farview timeline: colored lanes of project bars around a vertical gradient line marking today, with goals flying small pennants above."
      />

      <h2>Read-only by default</h2>
      <p>
        A plain connect asks Capacities for{' '}
        <strong>read access and nothing else</strong> — it cannot create,
        change, or delete anything in your space, and the OAuth consent
        screen will show you exactly that. If you want to plan from the
        timeline, a separate opt-in unlocks editing: add goals, drag bars to
        move their dates. Even then, every write is a direct action of yours
        — never a background sync — and nothing is ever deleted. Every card
        still deep-links into Capacities, where the full editing lives.
      </p>

      <h2>No backend. Really none.</h2>
      <p>
        This site is static files. Your notes travel from your browser to
        Capacities and nowhere else — there is no server to trust, no account
        to create, no analytics, no tracking. The access token stays in your
        browser, and you can revoke it any time in Capacities under
        Settings&nbsp;→ Capacities API&nbsp;→ Connections.
      </p>

      <h2>Your object types, not ours</h2>
      <p>
        No Goal type? Most spaces have none, and Farview is at home there:
        point it at whatever type holds your work — Projects, Undertakings,
        Refits — and whichever date properties you actually use. Setup reads
        your space's real types and previews your real timeline before you
        save a thing. Two minutes, once.
      </p>

      <h2>Quarters, years, decades</h2>
      <p>
        One keystroke moves between the week-by-week texture of this quarter
        and the long arcs of the next ten years. Bars fill with{' '}
        <em>elapsed time</em>, not pretend percent-complete; work past its
        target gets a quiet marker, never a red alarm; undated items wait
        visibly in a Someday tray instead of disappearing.
      </p>
      <img
        src={decadeShot}
        alt="The decade zoom: alternating year bands with large quiet year numerals, project dots and multi-year arcs, and goal pennants."
      />

      <footer>
        <p class="fineprint">
          <a href="https://github.com/saj-sudo/farview">Source on GitHub</a> ·
          MIT licensed · built on the official Capacities API
        </p>
        <p class="fineprint">
          <strong>Disclaimer:</strong> Farview is an independent community
          tool. It is not affiliated with, endorsed by, or sponsored by
          Capacities. Capacities is a trademark of its respective owners.
        </p>
      </footer>
    </main>
  );
}

render(<Landing />, document.getElementById('root')!);
