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
    report("通常攻撃・回避あり", simulate(() => "slash", () => true));
    report("通常攻撃・回避なし", simulate(() => "slash", () => false));
    report("ダブルトリガー・回避あり", simulate(() => "double", () => true));
    report("チャージ連打", simulate(() => "charge", () => true));
    report(
      "通常＋瀕死(ZS<30)のみ回避",
      simulate(() => "slash", (s) => s.pcZs < 30),
    );
    report(
      "交互にチャージと通常",
      simulate((s) => (s.round % 2 === 1 ? "charge" : "release"), () => true),
    );
    expect(true).toBe(true); // レポート用。アサーションは特に持たない
  });
});
