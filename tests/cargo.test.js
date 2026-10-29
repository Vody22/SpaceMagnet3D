import { describe, it, expect } from 'vitest';
import { cargoSlot, cargoRadius } from '../src/sim/cargo.js';

describe('cargo layout', () => {
  it('blob radius grows monotonically', () => {
    let prev = 0;
    for (let n = 0; n < 2000; n += 10) {
      const r = cargoRadius(n, 1, 1.4);
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
  });

  it('slots stay inside the blob radius', () => {
    const p = {};
    for (let k = 0; k < 1500; k++) {
      cargoSlot(k, 1, 1.4, p);
      expect(Math.hypot(p.x, p.y, p.z)).toBeLessThanOrEqual(cargoRadius(k + 1, 1, 1.4) + 1e-9);
    }
  });

  it('slots do not pile on top of each other', () => {
    const pts = [];
    for (let k = 0; k < 400; k++) pts.push(cargoSlot(k, 1, 1.4, {}));
    let tooClose = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z);
        if (d < 0.3) tooClose++;
      }
    }
    // Organic, not a lattice: allow a few near-overlaps but no stacking.
    expect(tooClose).toBeLessThan(pts.length * 0.05);
  });
});
