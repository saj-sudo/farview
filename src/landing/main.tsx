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
      <div class="landing-art" aria-hidden="true" />
      <h1>Farview</h1>
      <p class="tagline">See your goals across time, in Capacities.</p>
      <p>
        Capacities holds your projects and goals but has no timeline. Farview
        reads them and draws one: a line for today, a bar for each project
        running to its target date, and a zoom from this quarter out to the
        next ten years.
      </p>
      <p>
        <a class="cta" href="/app/">
          Open Farview
        </a>
        <a class="cta-secondary" href="/app/">
          Try the demo (no account needed)
        </a>
      </p>
      <img
        src={timelineShot}
        alt="The Farview timeline for a synthetic boatyard: lanes of teal and sunflower bars, a sunflower band marking today, and small flags for goals."
      />

      <h2>Read-only unless you turn on editing</h2>
      <ul>
        <li>
          A normal connection asks Capacities for read access (
          <code>api:read</code>, plus <code>offline_access</code> so you stay
          signed in). The consent screen shows exactly that.
        </li>
        <li>
          Editing is a separate switch that adds <code>api:write</code>. Then
          you can add goals and drag bars to change their dates.
        </li>
        <li>
          Every write comes from something you did, like a finished drag or a
          click on Save.{' '}
          <a href="https://github.com/saj-sudo/farview/blob/main/tests/auth/pkce.test.ts">
            A test
          </a>{' '}
          checks that the write scope is never requested without the switch.
        </li>
        <li>
          Farview never deletes anything, and every card links back to the
          object in Capacities.
        </li>
      </ul>

      <h2>No server, no account, no analytics</h2>
      <p>
        The site is static files. Your notes go from your browser to
        Capacities and nowhere else, and the access token stays in your
        browser. You can revoke it in Capacities under Settings&nbsp;→
        Capacities API&nbsp;→ Connections.
      </p>
      <p>
        A strict Content-Security-Policy blocks every other script, and{' '}
        <a href="https://github.com/saj-sudo/farview/blob/main/tests/build/csp.test.ts">
          a test
        </a>{' '}
        checks it on each build.
      </p>

      <h2>Works with the types you already have</h2>
      <p>
        Most spaces have no Goal type, and you don't need one. Farview reads
        your types and offers what it recognises, such as &ldquo;Your projects
        are Project&rdquo;, and you tick what looks right. If it can't tell, you
        pick the type and its start and target dates, and a preview shows your
        timeline before you save anything.
      </p>

      <h2>What you need in Capacities</h2>
      <p>
        One object type whose objects have a date, such as a Project type with
        a start date and a target date.
      </p>
      <ul>
        <li>
          No such type yet? Open Settings → Object Types in Capacities, choose
          + New Type, and pick a prebuilt type such as Project from the
          gallery.
        </li>
        <li>
          A type with no date? Open the type&rsquo;s settings, choose Add
          property, and add a date.
        </li>
        <li>Goals, milestones and tags are optional.</li>
      </ul>

      <h2>From this quarter to the next decade</h2>
      <ul>
        <li>Zoom between a quarter, a year, three years and a decade.</li>
        <li>
          A bar fills as time passes, so you can see how much of its window is
          used up.
        </li>
        <li>
          Past its target date, an item gets a small marker and a plain note.
        </li>
        <li>Items with no dates wait in a Someday tray.</li>
      </ul>
      <img
        src={decadeShot}
        alt="The decade zoom: alternating year bands with faint year numbers, short bars and dots for projects, and flags for goals."
      />

      <h2>Works on a phone</h2>
      <p>
        On a narrow screen the page opens as a list, and one tap shows the full
        timeline, which you drag sideways. Choose light, dark or automatic,
        and add the site to your home screen if you like.
      </p>

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
