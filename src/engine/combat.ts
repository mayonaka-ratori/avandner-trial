/**
 * combat.ts — 体験版の簡易戦闘の状態機械
 *
 * 原作のラウンド制戦闘（カウントダウン・ダイアクロックマップ）を、
 * 1 人・数分で遊べる形に畳んだもの。
 *   1 ラウンド = プレイヤーの攻撃 1 回 → ザイラの反撃 1 回
 * 反撃の前に「ジグスラストで回避するか」を選ぶ。
 * 座標攻撃のラウンドは回避できない（原作どおりペナルティを受けない）。
 * チャージアタックは 2 ターン行動（突入→解放）で、突入中は無防備。
 */

import { judgeAttack, type AttackJudgement } from "./judge";
import type { Rng } from "./dice";
import { approachPath, cellLabel, CENTER, evadePath, START_CELL, type ClockCell, type ClockHour, type Movement } from "./position";
import {
  CHARGE_ATTACK_MULTIPLIER,
  DOUBLE_TRIGGER_PENALTY,
  JIG_THRUST_CELLS,
  JIG_THRUST_COST,
  KUROAYA,
  PC,
  ZAIRA,
  zairaAttackFor,
  type ZairaAttack,
} from "@/data/character";

export type AttackMode = "slash" | "double" | "charge" | "release";

export interface AttackOption {
  mode: AttackMode;
  label: string;
  hint: string;
}

/** 通常ターンに出す攻撃の選択肢 */
export const ATTACK_OPTIONS: AttackOption[] = [
  {
    mode: "slash",
    label: "黒絢で斬る",
    hint: "連射2・目標値5・威力30。堅実な一撃",
  },
  {
    mode: "double",
    label: "ダブルトリガー",
    hint: "両手の黒絢で2回攻撃（目標値−2）",
  },
  {
    mode: "charge",
    label: "チャージアタック",
    hint: `超過移動で突入し、次ターンに威力×${CHARGE_ATTACK_MULTIPLIER}で解放。突入中は回避できない`,
  },
];

/** 突入中（charging）のターンに出す唯一の選択肢 */
export const RELEASE_OPTION: AttackOption = {
  mode: "release",
  label: "黒絢を振り下ろす",
  hint: `溜めた一撃を解放（威力×${CHARGE_ATTACK_MULTIPLIER}）`,
};

export type CombatPhase =
  | "player-turn" // 攻撃手段を選ぶ
  | "evade-prompt" // 敵の攻撃に対して回避するか選ぶ
  | "enemy-ready" // 回避できない攻撃。敵のダイスを振るのを待つ
  | "enemy-resolved" // 敵の攻撃の結果を見せる（「次へ」で次ラウンド）
  | "won"
  | "lost";

export interface CombatLogEntry {
  round: number;
  actor: "pc" | "zaira" | "system";
  text: string;
  title?: string;
  judgement?: AttackJudgement;
}

export interface CombatState {
  round: number;
  zairaHp: number;
  pcZs: number;
  pcCell: ClockCell;
  approachHour: ClockHour;
  lastMove?: Movement;
  /** チャージアタックの突入中か（次の手番は解放のみ・回避不可） */
  charging: boolean;
  phase: CombatPhase;
  /** このラウンドに来る敵の攻撃 */
  incoming: ZairaAttack;
  /** プレイヤーの攻撃の結果（表示用） */
  lastPlayerResult?: AttackJudgement[];
  lastEnemyResult?: AttackJudgement;
  log: CombatLogEntry[];
}

export function createCombat(): CombatState {
  return {
    round: 1,
    zairaHp: ZAIRA.hp,
    pcZs: PC.zsMax,
    pcCell: START_CELL,
    approachHour: 6,
    charging: false,
    phase: "player-turn",
    incoming: zairaAttackFor(1),
    log: [
      {
        round: 1,
        actor: "system",
        text: "中央のザイラを倒し、列車を守る。",
      },
    ],
  };
}

/**
 * プレイヤーの攻撃を解決する。ダブルトリガーは 2 回判定。
 * 命中後は敵の反撃へ（座標攻撃なら回避選択を飛ばす）。
 * charge は突入のみで攻撃しない。敵の攻撃は別のダイス操作で解決する。
 */
export function playerAttack(
  state: CombatState,
  mode: AttackMode,
  rng?: Rng,
): CombatState {
  if (state.phase !== "player-turn") return state;
  if (!attackOptionsFor(state).some((option) => option.mode === mode)) return state;

  const log = [...state.log];
  const path = approachPath(state.pcCell);
  if (path.length > 1) {
    log.push({ round: state.round, actor: "pc", text: `ザイラへ接近。${path.map(cellLabel).join(" → ")}。` });
  }
  const approachHour = state.pcCell.ring === "center" ? state.approachHour : state.pcCell.hour;
  state = {
    ...state,
    pcCell: CENTER,
    approachHour,
    lastMove: path.length > 1 ? { kind: "approach", path } : undefined,
    lastPlayerResult: undefined,
    lastEnemyResult: undefined,
  };

  // ── チャージアタック 1 ターン目：突入（無防備） ──
  if (mode === "charge") {
    log.push({
      round: state.round,
      actor: "pc",
      text: "チャージアタックで突入。今回は攻撃せず、次の手番に威力3倍で攻撃します。突入中は回避できません。",
    });
    return { ...state, charging: true, phase: "enemy-ready", log };
  }

  // ── 通常攻撃／ダブルトリガー／チャージ解放 ──
  const results: AttackJudgement[] = [];
  const isRelease = mode === "release";

  if (mode === "double") {
    for (const hand of ["右手", "左手"] as const) {
      const judgement = judgeAttack({
        burst: KUROAYA.burst,
        target: KUROAYA.target,
        penalty: DOUBLE_TRIGGER_PENALTY,
        power: KUROAYA.power,
        damageReduction: 0,
        criticalTriggerBonus: KUROAYA.criticalTriggerBonus,
        rng,
      });
      results.push(judgement);
      log.push({
        round: state.round,
        actor: "pc",
        text: `${hand}の黒絢。${describeJudgement(judgement)}`,
        title: `${hand}の黒絢`,
        judgement,
      });
    }
  } else {
    const judgement = judgeAttack({
      burst: KUROAYA.burst,
      target: KUROAYA.target,
      penalty: 0,
      power: KUROAYA.power * (isRelease ? CHARGE_ATTACK_MULTIPLIER : 1),
      damageReduction: 0,
      criticalTriggerBonus: KUROAYA.criticalTriggerBonus,
      rng,
    });
    results.push(judgement);
    log.push({
      round: state.round,
      actor: "pc",
      text: isRelease
        ? `突入の勢いそのままに、黒絢を振り下ろす。${describeJudgement(judgement)}`
        : `黒絢を振るう。${describeJudgement(judgement)}`,
      title: isRelease ? "チャージアタックの一撃" : "黒絢で斬る",
      judgement,
    });
  }

  const totalDamage = results.reduce((sum, j) => sum + (j.appliedDamage ?? 0), 0);
  const zairaHp = Math.max(0, state.zairaHp - totalDamage);

  if (zairaHp <= 0) {
    log.push({
      round: state.round,
      actor: "system",
      text: "ザイラの巨体が傾ぎ、ジアドスフィアの光が弾けて消えた。",
    });
    return {
      ...state,
      zairaHp,
      charging: false,
      phase: "won",
      lastPlayerResult: results,
      log,
    };
  }

  const incoming = zairaAttackFor(state.round);
  const next: CombatState = {
    ...state,
    zairaHp,
    charging: false,
    incoming,
    phase: incoming.coordinateAttack ? "enemy-ready" : "evade-prompt",
    lastPlayerResult: results,
    log,
  };

  return next;
}

/**
 * 敵の攻撃を解決する。evade = ジグスラストで回避を試みる。
 * 敵の攻撃を待っているフェイズ以外では何もしない（二重呼び出し防止）。
 */
export function resolveEnemyAttack(
  state: CombatState,
  evade: boolean,
  rng?: Rng,
): CombatState {
  if (state.phase !== "evade-prompt" && state.phase !== "enemy-ready") return state;
  return resolveIncoming(state, evade, rng);
}

/** 敵の攻撃の実際の解決処理（フェイズを問わず playerAttack からも呼ばれる） */
function resolveIncoming(
  state: CombatState,
  evade: boolean,
  rng?: Rng,
): CombatState {
  const attack = state.incoming;
  const log = [...state.log];
  let zs = state.pcZs;

  const canEvade = !attack.coordinateAttack && evade && !state.charging && state.pcZs > JIG_THRUST_COST;
  const penalty = canEvade ? JIG_THRUST_CELLS : 0;
  const path = canEvade ? evadePath(state.approachHour) : undefined;
  const pcCell = path ? path[path.length - 1] : state.pcCell;
  const lastMove: Movement | undefined = path ? { kind: "evade", path } : state.lastMove;
  if (canEvade) {
    zs -= JIG_THRUST_COST;
    log.push({
      round: state.round,
      actor: "pc",
      text: `ジグスラストで3セル移動。${path!.map(cellLabel).join(" → ")}。ジアドスフィアを${JIG_THRUST_COST}消費。`,
    });
  }

  log.push({ round: state.round, actor: "zaira", text: `${attack.flavor}（${attack.label}）` });

  const judgement = judgeAttack({
    burst: attack.burst,
    target: attack.target,
    penalty,
    power: attack.power,
    damageReduction: PC.damageReduction,
    // 体験版では敵の攻撃にクリティカルを付けない。
    // クリ連鎖があると被弾が 50 点級まで振れて、初見が理不尽に沈むため
    noCritical: true,
    rng,
  });
  const damage = judgement.appliedDamage ?? 0;
  zs -= damage;
  log.push({
    round: state.round,
    actor: "zaira",
    text: describeJudgement(judgement),
    title: `ザイラの${attack.label}`,
    judgement,
  });

  if (zs <= 0) {
    log.push({
      round: state.round,
      actor: "system",
      text: "ジアドスフィアが尽き、機関停止。――体が、動かない。",
    });
    return {
      ...state,
      pcZs: 0,
      pcCell,
      lastMove,
      phase: "lost",
      lastEnemyResult: judgement,
      log,
    };
  }

  return {
    ...state,
    pcZs: zs,
    pcCell,
    lastMove,
    phase: "enemy-resolved",
    lastEnemyResult: judgement,
    log,
  };
}

/** 「次のラウンドへ」ボタン */
export function nextRound(state: CombatState): CombatState {
  if (state.phase !== "enemy-resolved") return state;
  const round = state.round + 1;
  return { ...state, round, incoming: zairaAttackFor(round), lastPlayerResult: undefined, lastEnemyResult: undefined, phase: "player-turn" };
}

/** この手番に出すべき選択肢 */
export function attackOptionsFor(state: CombatState): AttackOption[] {
  return state.charging ? [RELEASE_OPTION] : ATTACK_OPTIONS;
}

function describeJudgement(j: AttackJudgement): string {
  if (j.autoFail) return "目標値が0以下――判定不能。弾は届かなかった。";
  const parts = [`${j.burst + j.extraDice}個のダイス：成功${j.successes}個`];
  if (j.criticals > 0) parts.push(`クリティカル${j.criticals}個`);
  if (j.appliedDamage !== null) parts.push(`${j.appliedDamage}ダメージ`);
  return parts.join("、") + "。";
}
