import { render } from 'preact';

// Placeholder landing — replaced by the full landing page in a later step.
function Landing() {
  return (
    <main class="landing">
      <h1>Farview</h1>
      <p class="tagline">See your goals across time, in Capacities.</p>
      <p>
        <a class="cta" href="/app/">
          Open Farview
        </a>
      </p>
    </main>
  );
}

render(<Landing />, document.getElementById('root')!);
