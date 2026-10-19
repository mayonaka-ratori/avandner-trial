/** 体験版は1ラウンドに互いが1回攻撃する。移動・命中・チャージの計算は原作に従う。 */
import { judgeAttack, type AttackJudgement } from "./judge";
import type { Rng } from "./dice";
import { attackRoutes, cellLabel, CENTER, evadeRoutes, inAttackArea, START_CELL, sweepCells, type ClockCell, type ClockHour, type Movement } from "./position";
import { CHARGE_ATTACK_PER_CELL, DOUBLE_TRIGGER_PENALTY, JIG_THRUST_CELLS, JIG_THRUST_COST, KUROAYA, PC, ZAIRA, zairaAttackFor, type ZairaAttack } from "@/data/character";

export type AttackMode = "slash" | "double";
export const ATTACK_OPTIONS: { mode: AttackMode; label: string }[] = [
  { mode: "slash", label: "黒絢で斬る" },
  { mode: "double", label: "ダブルトリガー" },
];
export type CombatPhase = "player-turn" | "evade-prompt" | "enemy-resolved" | "won" | "lost";
export interface CombatLogEntry {
  round: number;
  actor: "pc" | "zaira" | "system";
  text: string;
  detail?: string;
  title?: string;
  judgement?: AttackJudgement;
}
export interface ResourceChange {
  before: number;
  movementCost: number;
  damage: number;
  after: number;
}
export interface CombatState {
  round: number;
  zairaHp: number;
  pcZs: number;
  pcCell: ClockCell;
  approachHour: ClockHour;
  lastMove?: Movement;
  phase: CombatPhase;
  incoming: ZairaAttack;
  incomingCells: ClockCell[];
  lastPlayerResult?: AttackJudgement[];
  lastEnemyResult?: AttackJudgement;
  lastZsChange?: ResourceChange;
  escapedArea?: boolean;
  log: CombatLogEntry[];
}

export function createCombat(): CombatState {
  return {
    round: 1, zairaHp: ZAIRA.hp, pcZs: PC.zsMax, pcCell: START_CELL, approachHour: 6,
    phase: "player-turn", incoming: zairaAttackFor(1), incomingCells: [],
    log: [{ round: 1, actor: "system", text: "ザイラの耐久値を0にして列車を守る。あなたのZS（ジアドスフィア）が0になると機関停止。もう一度挑戦できます。" }],
  };
}

export function attackOptionsFor(): typeof ATTACK_OPTIONS { return ATTACK_OPTIONS; }

export function attackPower(state: CombatState, routeId = "direct"): number {
  const route = attackRoutes(state.pcCell).find((route) => route.id === routeId);
  return KUROAYA.power + Math.max(0, (route?.path.length ?? 1) - 1) * CHARGE_ATTACK_PER_CELL;
}

/** 黒絢はどちらの攻撃でも、同じ手番の移動セル数を威力に加える。 */
export function playerAttack(state: CombatState, mode: AttackMode, rng?: Rng, routeId = "direct"): CombatState {
  if (state.phase !== "player-turn" || !ATTACK_OPTIONS.some((option) => option.mode === mode)) return state;
  const route = attackRoutes(state.pcCell).find((route) => route.id === routeId);
  if (!route || state.pcZs <= route.cost) return state;
  const log = [...state.log];
  const cells = route.path.length - 1;
  const power = attackPower(state, routeId);
  if (cells > 0) log.push({ round: state.round, actor: "pc", text: `${cells}セル移動。チャージアタック：威力30→${power}、ZS消費${route.cost}。`, detail: route.path.map(cellLabel).join(" → ") });
  const results = (mode === "double" ? ["右手の黒絢", "左手の黒絢"] : ["黒絢で斬る"]).map((title) => {
    const judgement = judgeAttack({ burst: KUROAYA.burst, target: KUROAYA.target, penalty: mode === "double" ? DOUBLE_TRIGGER_PENALTY : 0, power, damageReduction: 0, criticalTriggerBonus: KUROAYA.criticalTriggerBonus, rng });
    log.push({ round: state.round, actor: "pc", text: `${title}。${describeJudgement(judgement)}`, title, judgement });
    return judgement;
  });
  const totalDamage = results.reduce((sum, result) => sum + (result.appliedDamage ?? 0), 0);
  const zairaHp = Math.max(0, state.zairaHp - totalDamage);
  if (zairaHp === 0) log.push({ round: state.round, actor: "system", text: "ザイラが停止しました。装甲列車は無事です。" });
  return {
    ...state, zairaHp, pcZs: state.pcZs - route.cost, pcCell: CENTER,
    approachHour: route.path.length > 1 ? (route.path[route.path.length - 2] as { hour: ClockHour }).hour : state.approachHour,
    lastMove: cells > 0 ? { kind: "approach", path: route.path } : undefined,
    lastPlayerResult: results, lastEnemyResult: undefined, escapedArea: undefined,
    lastZsChange: route.cost ? { before: state.pcZs, movementCost: route.cost, damage: 0, after: state.pcZs - route.cost } : undefined,
    phase: zairaHp === 0 ? "won" : "evade-prompt", log,
  };
}

/** 回避先のID、または移動しない場合はstay。座標攻撃は範囲外なら判定せず失敗する。 */
export function resolveEnemyAttack(state: CombatState, defense: string, rng?: Rng): CombatState {
  if (state.phase !== "evade-prompt") return state;
  const route = defense === "stay" ? undefined : evadeRoutes(state.approachHour).find((route) => route.id === defense);
  if (defense !== "stay" && (!route || state.pcZs <= JIG_THRUST_COST)) return state;
  const pcCell = route ? route.path[route.path.length - 1] : state.pcCell;
  const cost = route ? JIG_THRUST_COST : 0;
  const escapedArea = state.incoming.coordinateAttack && !inAttackArea(pcCell, state.incomingCells);
  const log = [...state.log];
  if (route) log.push({ round: state.round, actor: "pc", text: `ジグスラストで${JIG_THRUST_CELLS}セル移動して${cellLabel(pcCell)}へ。ZSを${cost}消費。`, detail: route.path.map(cellLabel).join(" → ") });
  log.push({ round: state.round, actor: "zaira", text: `${state.incoming.flavor}（${state.incoming.label}）` });
  let judgement: AttackJudgement | undefined;
  if (escapedArea) {
    log.push({ round: state.round, actor: "system", text: "攻撃範囲の外へ移動しました。機銃掃射は外れ、敵のダイスは振りません。" });
  } else {
    judgement = judgeAttack({ burst: state.incoming.burst, target: state.incoming.target, penalty: route && !state.incoming.coordinateAttack ? JIG_THRUST_CELLS : 0, power: state.incoming.power, damageReduction: PC.damageReduction, noCritical: true, rng });
    log.push({ round: state.round, actor: "zaira", text: describeJudgement(judgement), title: `ザイラの${state.incoming.label}`, judgement });
  }
  const damage = judgement?.appliedDamage ?? 0;
  const pcZs = Math.max(0, state.pcZs - cost - damage);
  log.push({ round: state.round, actor: "system", text: `ZS ${state.pcZs} → ${pcZs}（回避の消費${cost}＋被弾${damage}）。` });
  if (pcZs === 0) log.push({ round: state.round, actor: "system", text: "ZSが尽き、機関停止しました。" });
  return {
    ...state, pcZs, pcCell, lastMove: route ? { kind: "evade", path: route.path } : undefined,
    phase: pcZs === 0 ? "lost" : "enemy-resolved", lastEnemyResult: judgement, escapedArea,
    lastZsChange: { before: state.pcZs, movementCost: cost, damage, after: pcZs }, log,
  };
}

export function nextRound(state: CombatState): CombatState {
  if (state.phase !== "enemy-resolved") return state;
  const round = state.round + 1;
  const incoming = zairaAttackFor(round);
  return { ...state, round, incoming, incomingCells: incoming.coordinateAttack ? sweepCells(round) : [], phase: "player-turn", lastPlayerResult: undefined, lastEnemyResult: undefined, lastZsChange: undefined, escapedArea: undefined };
}

function describeJudgement(j: AttackJudgement): string {
  return `${j.burst + j.extraDice}個のダイス。成功${j.successes}個、${j.appliedDamage ?? 0}ダメージ。`;
}
