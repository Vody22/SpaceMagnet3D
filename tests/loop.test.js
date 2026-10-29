import { describe, it, expect } from 'vitest';
import { FixedStep } from '../src/core/Loop.js';

describe('fixed timestep', () => {
  for (const fps of [30, 60, 75, 144, 240]) {
    it(`runs 60 sim steps per second at ${fps} fps`, () => {
      const fs = new FixedStep(1 / 60);
      let steps = 0;
      for (let i = 0; i < fps * 5; i++) steps += fs.advance(1 / fps);
      expect(Math.abs(steps - 300)).toBeLessThanOrEqual(1);
    });
  }

  it('caps catch-up after a long stall', () => {
    const fs = new FixedStep(1 / 60, 6);
    expect(fs.advance(3)).toBe(6);
  });
});
