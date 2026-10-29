// Organic cargo layout: slot k gets a deterministic spot on a growing, slightly
// flattened blob around the ship, so the ship visibly "accretes" its haul.

const A1 = 0.7548776662466927; // R2 low-discrepancy sequence constants
const A2 = 0.5698402909980532;
const FLATTEN = 0.55; // squash vertically so the blob reads well from the top-down camera
const PACK = 0.208 / FLATTEN; // r^3 grows by PACK * spacing^3 per item (random close packing)

function fract(x) {
  return x - Math.floor(x);
}

export function cargoRadius(count, spacing, coreRadius) {
  return Math.cbrt(coreRadius ** 3 + count * PACK * spacing ** 3);
}

export function cargoSlot(k, spacing, coreRadius, out = { x: 0, y: 0, z: 0 }) {
  const r = cargoRadius(k + 1, spacing, coreRadius) - spacing * 0.35;
  const u = fract(0.5 + (k + 1) * A1);
  const v = fract(0.5 + (k + 1) * A2);
  const y = 1 - 2 * u;
  const s = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = v * Math.PI * 2;
  out.x = Math.cos(theta) * s * r;
  out.z = Math.sin(theta) * s * r;
  out.y = y * r * FLATTEN;
  return out;
}
