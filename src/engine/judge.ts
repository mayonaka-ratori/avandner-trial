/**
 * judge.ts — 命中判定とダメージの数え方（『黒絢のアヴァンドナー』のルール）
 * （avandner-app の game/lib/attackJudge.ts と同じもの。import 先だけ dice.ts に替えてある）
 *
 *   - ダイスは１０面体。０の出目は１０として扱う
 *   - 「連射数」に等しい数のダイスを振り、「目標値」以下の目を出したダイスの個数が成功数
 *   - ペナルティ … 目標値を減少する効果。複数あれば合計する
 *   - クリティカル … 出目が１のダイス。成功数１個と数えたうえで、さらに振り足す（連鎖する）
 *   - 【クリティカル不能】を持つウェポンでは、クリティカルは一切発生しない
 *   - 実効目標値＝目標値−ペナルティ（上限 9）。0 以下なら判定せず自動失敗
 *   - ダメージ … 成功数×威力−【ダメージ軽減】（下限 0）
 */

import { rollDice, type Rng } from "./dice";

export const DICE_SIDES = 10;
export const CRITICAL_VALUE = 1;
export const MAX_TARGET = 9;
export const MAX_RAW_TARGET = 99;
export const MIN_TARGET = 0;
export const MAX_BURST = 30;
export const MAX_PENALTY = 99;
export const MAX_EXTRA_DICE = 100;
export const MAX_DAMAGE_REDUCTION = 999;
export const MAX_CRITICAL_TRIGGER_BONUS = 999;

export interface JudgeDie {
  value: number;
  isSuccess: boolean;
  isCritical: boolean;
  wave: number;
}

export interface AttackJudgeInput {
  burst: number;
  target: number;
  penalty?: number;
  power?: number | null;
  damageReduction?: number;
  noCritical?: boolean;
  criticalTriggerBonus?: number;
  rng?: Rng;
}

export interface AttackJudgement {
  burst: number;
  target: number;
  penalty: number;
  effectiveTarget: number;
  autoFail: boolean;
  dice: JudgeDie[];
  successes: number;
  criticals: number;
  extraDice: number;
  truncated: boolean;
  noCritical: boolean;
  criticalTriggerBonus: number;
  criticalBonusDamage: number;
  power: number | null;
  rawDamage: number | null;
  damageReduction: number;
  appliedDamage: number | null;
}

export function clampTarget(target: number): number {
  return clampInt(target, MIN_TARGET, MAX_TARGET);
}

export function clampRawTarget(target: number): number {
  return clampInt(target, MIN_TARGET, MAX_RAW_TARGET);
}

export function clampCriticalTriggerBonus(value: number): number {
  return clampInt(value, 0, MAX_CRITICAL_TRIGGER_BONUS);
}

export function clampBurst(burst: number): number {
  return clampInt(burst, 0, MAX_BURST);
}

export function clampPenalty(penalty: number): number {
  return clampInt(penalty, 0, MAX_PENALTY);
}

export function clampDamageReduction(value: number): number {
  return clampInt(value, 0, MAX_DAMAGE_REDUCTION);
}

export function effectiveTargetOf(target: number, penalty: number): number {
  return Math.min(MAX_TARGET, clampRawTarget(target) - clampPenalty(penalty));
}

export function judgeAttack(input: AttackJudgeInput): AttackJudgement {
  const burst = clampBurst(input.burst);
  const target = clampRawTarget(input.target);
  const penalty = clampPenalty(input.penalty ?? 0);
  const effectiveTarget = Math.min(MAX_TARGET, target - penalty);
  const power = normalizePower(input.power);
  const damageReduction = clampDamageReduction(input.damageReduction ?? 0);
  const noCritical = input.noCritical === true;
  const criticalTriggerBonus = clampCriticalTriggerBonus(input.criticalTriggerBonus ?? 0);
  const rng = input.rng;

  const dice: JudgeDie[] = [];
  let extraDice = 0;
  let truncated = false;

  const autoFail = effectiveTarget <= 0;

  if (!autoFail) {
    let pending = burst;
    let wave = 0;

    while (pending > 0) {
      let criticalsThisWave = 0;

      for (const value of rollDice(pending, DICE_SIDES, rng)) {
        const isCritical = !noCritical && value === CRITICAL_VALUE;
        if (isCritical) criticalsThisWave += 1;
        dice.push({
          value,
          isSuccess: value <= effectiveTarget,
          isCritical,
          wave,
        });
      }

      wave += 1;

      if (criticalsThisWave === 0) break;

      const room = MAX_EXTRA_DICE - extraDice;
      if (room <= 0) {
        truncated = true;
        break;
      }

      pending = Math.min(criticalsThisWave, room);
      if (pending < criticalsThisWave) truncated = true;
      extraDice += pending;
    }
  }

  const successes = dice.filter((d) => d.isSuccess).length;
  const criticals = dice.filter((d) => d.isCritical).length;
  const criticalBonusDamage = criticals * criticalTriggerBonus;
  const rawDamage =
    power === null ? null : calcRawDamage(successes, power, criticalBonusDamage);
  const appliedDamage = rawDamage === null ? null : calcAppliedDamage(rawDamage, damageReduction);

  return {
    burst,
    target,
    penalty,
    effectiveTarget,
    autoFail,
    dice,
    successes,
    criticals,
    extraDice,
    truncated,
    noCritical,
    criticalTriggerBonus,
    criticalBonusDamage,
    power,
    rawDamage,
    damageReduction,
    appliedDamage,
  };
}

export function calcRawDamage(
  successes: number,
  power: number,
  criticalBonusDamage = 0,
): number {
  const safeSuccesses = Math.max(0, toInt(successes, 0));
  const safePower = Math.max(0, toInt(power, 0));
  const safeBonus = Math.max(0, toInt(criticalBonusDamage, 0));
  return safeSuccesses * safePower + safeBonus;
}

export function calcAppliedDamage(rawDamage: number, damageReduction: number): number {
  return Math.max(0, toInt(rawDamage, 0) - clampDamageReduction(damageReduction));
}

function normalizePower(power: number | null | undefined): number | null {
  if (power === null || power === undefined) return null;
  if (!Number.isFinite(power)) return null;
  return Math.max(0, Math.trunc(power));
}

function toInt(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
