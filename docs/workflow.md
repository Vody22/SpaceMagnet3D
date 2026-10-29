# Workflow

Practices adopted from the Superpowers skills library (https://github.com/obra/superpowers), applied to this repo.

- **Test-driven fixes.** A bug gets a failing test first, then the fix; the test is run red before and green after.
  Example: rocks used to hit a big ship twice in one impact. `tests/world.test.js` checks that one impact counts once;
  it fails with the fix removed and passes with it.
- **Systematic debugging.** No fix without a root cause. Flaky browser checks are reproduced headless first
  (same seed, same autopilot) and instrumented before anything is changed. Examples from stage 2: the "big haul"
  check failed because the autopilot flew into rocks and gravity wells; the gravity-well check failed because the
  well orbits away at about 2.6 m/s while the idle ship drifts in at about 4 m/s.
- **Verification before completion.** A stage is only reported done after a fresh run of `npm test`, `npm run build`
  and `npm run test:e2e`, with the actual output quoted. Headless Chromium uses software rendering (about 5 fps), so
  it proves behaviour, never performance.
- **Plans per stage.** Each stage starts from a short written plan in `docs/plans/` listing files, tests and checks.
