import { config } from 'zod';

// The SDK validates responses with zod. Without `jitless`, zod probes for
// eval support with `new Function`, which the strict CSP blocks and reports
// as a violation on every page load. Validation works the same either way.
config({ jitless: true });
