import { RANKS } from './config.js';

export function rankFor(totalEarned) {
  let n = 0;
  while (totalEarned >= RANKS.threshold(n + 1)) n++;
  return n;
}

export function rankTitle(n) {
  const t = RANKS.titles;
  if (n < t.length) return t[n];
  return `${t[t.length - 1]} ${n - t.length + 2}`;
}

export function sellMultiplier(rank) {
  return 1 + rank * RANKS.sellBonusPerRank;
}

// Progress toward the next rank, 0..1.
export function rankProgress(totalEarned) {
  const n = rankFor(totalEarned);
  const a = RANKS.threshold(n);
  const b = RANKS.threshold(n + 1);
  return n === 0 && a === 0 ? totalEarned / b : (totalEarned - a) / (b - a);
}
