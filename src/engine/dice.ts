/**
 * dice.ts — ダイスを振るだけの純関数
 * （avandner-app の core/dice/roll.ts と同じもの）
 */

/** 0 以上 1 未満の数を返す関数。既定は Math.random */
export type Rng = () => number;

/** 一度に振れる本数の安全上限 */
export const MAX_DICE_COUNT = 200;

/** ダイス1個を振る */
export function rollDie(sides: number = 6, rng: Rng = Math.random): number {
  const safeSides = Number.isFinite(sides) ? Math.max(1, Math.floor(sides)) : 6;
  const face = rng() * safeSides;
  return Number.isFinite(face) ? Math.min(safeSides, Math.max(1, Math.floor(face) + 1)) : 1;
}

/** ダイスを count 個振って、出目の配列を返す */
export function rollDice(
  count: number,
  sides: number = 6,
  rng: Rng = Math.random,
): number[] {
  if (!Number.isFinite(count)) return [];

  const safeCount = Math.min(Math.floor(count), MAX_DICE_COUNT);
  if (safeCount <= 0) return [];

  const safeSides = Number.isFinite(sides) ? Math.max(1, Math.floor(sides)) : 6;
  return Array.from({ length: safeCount }, () => rollDie(safeSides, rng));
}
