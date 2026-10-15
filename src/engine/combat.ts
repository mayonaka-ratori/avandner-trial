/**
 * combat.ts — 体験版の簡易戦闘の状態機械
 *
 * 原作のラウンド制戦闘（カウントダウン・ダイアクロックマップ）を、
 * 1 人・数分で遊べる形に畳んだもの。
 *   1 ラウンド = プレイヤーの攻撃 1 回 → ザイラの反撃 1 回
 * 反撃の前に「ジグスラストで回避するか」を選ぶ。
 * 座標攻撃のラウンドは回避できない（原作どおりペナルティを受けない）。
 */

import { judgeAttack, type AttackJudgement } from "./judge";
import type { Rng } from "./dice";
import {
  CHARGE_ATTACK_COST,
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

export type AttackMode = "slash" | "double" | "charge";

export interface AttackOption {
  mode: AttackMode;
  label: string;
  hint: string;
}

/** 毎ラウンドに出す攻撃の選択肢 */
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
    label: `チャージアタック`,
    hint: `超過移動で斬り込む（威力×${CHARGE_ATTACK_MULTIPLIER}・コスト${CHARGE_ATTACK_COST}）`,
  },
];

export type CombatPhase =
  | "player-turn" // 攻撃手段を選ぶ
  | "evade-prompt" // 敵の攻撃に対して回避するか選ぶ
  | "enemy-resolved" // 敵の攻撃の結果を見せる（「次へ」で次ラウンド）
  | "won"
  | "lost";

export interface CombatLogEntry {
  round: number;
  actor: "pc" | "zaira" | "system";
  text: string;
  judgement?: AttackJudgement;
}

export interface CombatState {
  round: number;
  zairaHp: number;
  pcZs: number;
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
    phase: "player-turn",
    incoming: zairaAttackFor(1),
    log: [
      {
        round: 1,
        actor: "system",
        text: `――ローザ渓谷。${ZAIRA.flavor}。装甲列車が到達する前に、撃破しなければならない。`,
      },
    ],
  };
}

/**
 * プレイヤーの攻撃を解決する。ダブルトリガーは 2 回判定。
 * 命中後は敵の反撃へ（座標攻撃なら回避選択を飛ばす）。
 */
export function playerAttack(
  state: CombatState,
  mode: AttackMode,
  rng?: Rng,
): CombatState {
  if (state.phase !== "player-turn") return state;

  let zs = state.pcZs;
  const results: AttackJudgement[] = [];
  const log = [...state.log];

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
        judgement,
      });
    }
  } else {
    const isCharge = mode === "charge";
    if (isCharge) zs -= CHARGE_ATTACK_COST;
    const judgement = judgeAttack({
      burst: KUROAYA.burst,
      target: KUROAYA.target,
      penalty: 0,
      power: KUROAYA.power * (isCharge ? CHARGE_ATTACK_MULTIPLIER : 1),
      damageReduction: 0,
      criticalTriggerBonus: KUROAYA.criticalTriggerBonus,
      rng,
    });
    results.push(judgement);
    log.push({
      round: state.round,
      actor: "pc",
      text: isCharge
        ? `超過移動――間合いを一瞬で詰め、黒絢を叩き込む。${describeJudgement(judgement)}`
        : `黒絢を振るう。${describeJudgement(judgement)}`,
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
    return { ...state, zairaHp, pcZs: zs, phase: "won", lastPlayerResult: results, log };
  }

  if (zs <= 0) {
    log.push({
      round: state.round,
      actor: "system",
      text: "コストの支払い過ぎでジアドスフィアが尽きた。機関停止。",
    });
    return { ...state, zairaHp, pcZs: zs, phase: "lost", lastPlayerResult: results, log };
  }

  const incoming = zairaAttackFor(state.round);
  const nextPhase: CombatPhase = incoming.coordinateAttack ? "enemy-resolved" : "evade-prompt";

  const next: CombatState = {
    ...state,
    zairaHp,
    pcZs: zs,
    incoming,
    phase: nextPhase,
    lastPlayerResult: results,
    log,
  };

  // 座標攻撃（回避不可）はそのまま敵の攻撃を解決する
  if (nextPhase === "enemy-resolved") {
    return resolveEnemyAttack(next, false, rng);
  }
  return next;
}

/** 敵の攻撃を解決する。evade = ジグスラストで回避を試みる */
export function resolveEnemyAttack(
  state: CombatState,
  evade: boolean,
  rng?: Rng,
): CombatState {
  const attack = state.incoming;
  const log = [...state.log];
  let zs = state.pcZs;

  const canEvade = !attack.coordinateAttack && evade;
  const penalty = canEvade ? JIG_THRUST_CELLS : 0;
  if (canEvade) {
    zs -= JIG_THRUST_COST;
    log.push({
      round: state.round,
      actor: "pc",
      text: `ジグスラスト噴射――3セル分、身体を引き剥がす（ZS−${JIG_THRUST_COST}）。`,
    });
  }

  log.push({ round: state.round, actor: "zaira", text: `${attack.flavor}（${attack.label}）` });

  const judgement = judgeAttack({
    burst: attack.burst,
    target: attack.target,
    penalty,
    power: attack.power,
    damageReduction: PC.damageReduction,
    rng,
  });
  const damage = judgement.appliedDamage ?? 0;
  zs -= damage;
  log.push({
    round: state.round,
    actor: "zaira",
    text: describeJudgement(judgement),
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
      phase: "lost",
      lastEnemyResult: judgement,
      log,
    };
  }

  const nextRound = state.round + 1;
  return {
    ...state,
    round: nextRound,
    pcZs: zs,
    incoming: zairaAttackFor(nextRound),
    phase: "enemy-resolved",
    lastEnemyResult: judgement,
    log,
  };
}

/** 「次のラウンドへ」ボタン */
export function nextRound(state: CombatState): CombatState {
  if (state.phase !== "enemy-resolved") return state;
  return { ...state, phase: "player-turn" };
}

function describeJudgement(j: AttackJudgement): string {
  if (j.autoFail) return "目標値が0以下――判定不能。弾は届かなかった。";
  const parts = [
    `${j.burst + j.extraDice}個のダイス：成功${j.successes}個`,
  ];
  if (j.criticals > 0) parts.push(`クリティカル${j.criticals}個`);
  if (j.appliedDamage !== null) parts.push(`${j.appliedDamage}ダメージ`);
  return parts.join("、") + "。";
}
