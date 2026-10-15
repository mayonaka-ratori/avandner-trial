/**
 * combat.sim.test.ts — 戦闘バランスのモンテカルロ
 *
 * 各戦法で何ラウンドで終わるか・どれくらい負けるかを数える。
 * 体験版は 5〜10 分想定なので、決着は 3〜6 ラウンド・敗北率は
 * 「全力ミスプレイでも 2 回に 1 回は負けない」あたりが目安。
 * チャージアタック中（charging）は選択肢が「解放」だけなので、
 * 戦法関数には state を渡して整合させる。
 */

import { describe, expect, it } from "vitest";
import {
  attackOptionsFor,
  createCombat,
  nextRound,
  playerAttack,
  resolveEnemyAttack,
  type AttackMode,
  type CombatState,
} from "./combat";

interface SimResult {
  wins: number;
  losses: number;
  avgRounds: number;
  maxRounds: number;
  minRounds: number;
}

type Strategy = (state: CombatState) => AttackMode;
type EvadePolicy = (state: CombatState) => boolean;

function simulate(
  attack: Strategy,
  evade: EvadePolicy,
  trials = 500,
): SimResult {
  let wins = 0;
  let losses = 0;
  let totalRounds = 0;
  let maxRounds = 0;
  let minRounds = Infinity;

  for (let i = 0; i < trials; i++) {
    let s: CombatState = createCombat();
    let guard = 0;
    while (s.phase !== "won" && s.phase !== "lost" && guard < 40) {
      if (s.phase === "player-turn") {
        const legal = attackOptionsFor(s).map((o) => o.mode);
        let mode = attack(s);
        if (!legal.includes(mode)) mode = legal[0];
        s = playerAttack(s, mode);
      } else if (s.phase === "evade-prompt") {
        s = resolveEnemyAttack(s, evade(s));
      } else if (s.phase === "enemy-resolved") {
        s = nextRound(s);
      }
      guard += 1;
    }
    if (s.phase === "won") {
      wins += 1;
      totalRounds += s.round;
      maxRounds = Math.max(maxRounds, s.round);
      minRounds = Math.min(minRounds, s.round);
    } else {
      losses += 1;
    }
  }
  return {
    wins,
    losses,
    avgRounds: totalRounds / Math.max(1, wins),
    maxRounds,
    minRounds,
  };
}

function report(name: string, r: SimResult) {
  const winRate = ((r.wins / (r.wins + r.losses)) * 100).toFixed(1);
  console.log(
    `${name}: 勝率 ${winRate}% / 平均 ${r.avgRounds.toFixed(1)}R（${r.minRounds}〜${r.maxRounds}）`,
  );
}

describe("戦闘バランス（500試行ずつ）", () => {
  it("各戦法の勝率とラウンド数", () => {
    const slashEvade = simulate(() => "slash", () => true);
    const slashNoEvade = simulate(() => "slash", () => false);
    const doubleEvade = simulate(() => "double", () => true);
    const chargeSpam = simulate(() => "charge", () => true);
    const slashLowHpEvade = simulate(
      () => "slash",
      (s) => s.pcZs < 30,
    );
    const alternate = simulate(
      (s) => (s.round % 2 === 1 ? "charge" : "release"),
      () => true,
    );

    report("通常攻撃・回避あり", slashEvade);
    report("通常攻撃・回避なし", slashNoEvade);
    report("ダブルトリガー・回避あり", doubleEvade);
    report("チャージ連打", chargeSpam);
    report("通常＋瀕死(ZS<30)のみ回避", slashLowHpEvade);
    report("交互にチャージと通常", alternate);

    // 乱数シミュレーションなので絶対に落ちない広いレンジで、
    // バランス退行（計算ロジックの破壊的変更）だけを検出する
    const winRate = (r: SimResult) => r.wins / (r.wins + r.losses);
    expect(winRate(slashEvade)).toBeGreaterThanOrEqual(0.55);
    expect(winRate(slashEvade)).toBeLessThanOrEqual(0.95);
    expect(winRate(slashNoEvade)).toBeGreaterThanOrEqual(0.2);
    expect(winRate(slashNoEvade)).toBeLessThanOrEqual(0.75);
    expect(winRate(chargeSpam)).toBeGreaterThanOrEqual(0.3);
    expect(winRate(chargeSpam)).toBeLessThanOrEqual(0.85);
    expect(slashEvade.avgRounds).toBeGreaterThanOrEqual(2);
    expect(slashEvade.avgRounds).toBeLessThanOrEqual(8);
  });
});
