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
        Capacities holds your projects and goals, but it has no timeline.
        Farview reads them and lays them out on one: a line for today, a bar
        for each project running toward its target date, and a zoom that
        goes from this quarter out to the next ten years.
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
      <p>
        A plain connection asks Capacities for{' '}
        <strong>read access only</strong>. Farview can't create, change or
        delete anything in your space, and the Capacities consent screen
        says so. If you want to plan from the timeline, you can turn on
        editing separately. Then you can add goals and drag bars to change
        their dates. Every change comes from something you did, like a drag
        or a click on Save. Farview never deletes anything, and every card
        links back to the object in Capacities.
      </p>

      <h2>No server</h2>
      <p>
        The site is a set of static files. Your notes go from your browser to
        Capacities and nowhere else. There's no account to make and no
        analytics. The access token stays in your browser, and you can revoke
        it in Capacities under Settings&nbsp;→ Capacities API&nbsp;→
        Connections.
      </p>

      <h2>Works with the types you already have</h2>
      <p>
        Most spaces don't have a Goal type, and you don't need one. Point
        Farview at whichever type holds your work (Projects, Refits, anything)
        and the date properties you actually use. Setup reads your space and
        shows a preview of your timeline before you save anything.
      </p>

      <h2>From this quarter to the next decade</h2>
      <p>
        Switch between quarter, year, three years and decade. A bar fills as
        time passes, so you can see how much of its window is used up. When
        something passes its target date it gets a small marker and a plain
        note. Items with no dates go to a Someday tray, so nothing drops off
        the page.
      </p>
      <img
        src={decadeShot}
        alt="The decade zoom: alternating year bands with faint year numbers, short bars and dots for projects, and flags for goals."
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
