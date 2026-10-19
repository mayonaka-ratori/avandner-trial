import type { CombatState } from "./combat";
import type { AttackJudgement } from "./judge";
import { sweepCells, type ClockCell } from "./position";
import { PC, ZAIRA, zairaAttackFor } from "@/data/character";

export interface BattleSave {
  version: 1;
  state: CombatState;
  lostCount: number;
  eventStart: number;
}

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const cell = (v: unknown): v is ClockCell => record(v) && (v.ring === "center" || ((v.ring === "in" || v.ring === "out") && integer(v.hour, 1, 12)));

function judgement(v: unknown): v is AttackJudgement {
  if (!record(v) || !Array.isArray(v.dice)) return false;
  const counts = ["burst", "target", "penalty", "successes", "criticals", "extraDice", "criticalTriggerBonus", "criticalBonusDamage", "damageReduction"];
  return counts.every((key) => integer(v[key])) && integer(v.effectiveTarget, -99, 9)
    && ["autoFail", "truncated", "noCritical"].every((key) => typeof v[key] === "boolean")
    && ["power", "rawDamage", "appliedDamage"].every((key) => v[key] === null || integer(v[key]))
    && v.dice.every((d) => record(d) && integer(d.value, 1, 10) && integer(d.wave) && typeof d.isSuccess === "boolean" && typeof d.isCritical === "boolean");
}

/** 古い保存にはbattleがない。壊れた戦闘データも物語の保存を残して読み飛ばす。 */
export function readBattleSave(value: unknown): BattleSave | undefined {
  if (!record(value) || value.version !== 1 || !integer(value.lostCount) || !integer(value.eventStart) || !record(value.state)) return;
  const s = value.state;
  if (!integer(s.round, 1) || !integer(s.pcZs, 0, PC.zsMax) || !integer(s.zairaHp, 0, ZAIRA.hp)
    || !cell(s.pcCell) || !integer(s.approachHour, 1, 12)
    || !["player-turn", "evade-prompt", "enemy-resolved", "won", "lost"].includes(String(s.phase))
    || !Array.isArray(s.log) || s.log.length === 0 || value.eventStart >= s.log.length) return;
  if (!s.log.every((entry) => record(entry) && integer(entry.round, 1) && ["pc", "zaira", "system"].includes(String(entry.actor)) && typeof entry.text === "string"
    && (entry.title === undefined || typeof entry.title === "string") && (entry.detail === undefined || typeof entry.detail === "string") && (entry.judgement === undefined || judgement(entry.judgement)))) return;
  if (s.lastMove !== undefined && (!record(s.lastMove) || !["approach", "evade"].includes(String(s.lastMove.kind)) || !Array.isArray(s.lastMove.path) || !s.lastMove.path.length || !s.lastMove.path.every(cell))) return;
  if (s.lastPlayerResult !== undefined && (!Array.isArray(s.lastPlayerResult) || !s.lastPlayerResult.every(judgement))) return;
  if (s.lastEnemyResult !== undefined && !judgement(s.lastEnemyResult)) return;
  if (s.escapedArea !== undefined && typeof s.escapedArea !== "boolean") return;
  if (s.lastZsChange !== undefined && (!record(s.lastZsChange) || ![s.lastZsChange.before, s.lastZsChange.after, s.lastZsChange.movementCost, s.lastZsChange.damage].every((v) => integer(v)))) return;
  if ((s.phase === "lost") !== (s.pcZs === 0) || (s.phase === "won") !== (s.zairaHp === 0)) return;
  const incoming = zairaAttackFor(s.round);
  return {
    version: 1, lostCount: value.lostCount, eventStart: value.eventStart,
    state: { ...s, incoming, incomingCells: incoming.coordinateAttack ? sweepCells(s.round) : [] } as unknown as CombatState,
  };
}
