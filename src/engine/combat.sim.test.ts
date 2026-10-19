/** 移動・回避の有無で勝率が変わり、長すぎる戦闘にならないことを確認する。 */
import { describe, expect, it } from "vitest";
import { evadeRoutes, inAttackArea } from "./position";
import {
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
  routeId = "direct",
): SimResult {
  let wins = 0;
  let losses = 0;
  let totalRounds = 0;
  let maxRounds = 0;
  let minRounds = Infinity;

  let seed = 12345;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < trials; i++) {
    let s: CombatState = createCombat();
    let guard = 0;
    while (s.phase !== "won" && s.phase !== "lost" && guard < 40) {
      if (s.phase === "player-turn") {
        s = playerAttack(s, attack(s), rng, s.pcZs <= 3 ? "direct" : routeId);
      } else if (s.phase === "evade-prompt") {
        const routes = evadeRoutes(s.approachHour);
        const safe = routes.find((r) => !inAttackArea(r.path[r.path.length - 1], s.incomingCells)) ?? routes[0];
        s = resolveEnemyAttack(s, evade(s) && s.pcZs > 3 ? safe.id : "stay", rng);
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
    const overdriveEvade = simulate(() => "slash", () => true, 500, "overdrive");
    const slashLowHpEvade = simulate(
      () => "slash",
      (s) => s.pcZs < 30,
    );

    report("通常攻撃・回避あり", slashEvade);
    report("通常攻撃・回避なし", slashNoEvade);
    report("ダブルトリガー・回避あり", doubleEvade);
    report("超過移動・回避あり", overdriveEvade);
    report("通常＋瀕死(ZS<30)のみ回避", slashLowHpEvade);

    const winRate = (r: SimResult) => r.wins / (r.wins + r.losses);
    expect(winRate(slashEvade)).toBeGreaterThanOrEqual(0.65);
    expect(winRate(slashEvade)).toBeGreaterThan(winRate(slashNoEvade));
    expect(winRate(overdriveEvade)).toBeGreaterThanOrEqual(0.65);
    expect(slashEvade.avgRounds).toBeGreaterThanOrEqual(2);
    expect(slashEvade.avgRounds).toBeLessThanOrEqual(8);
  });
});
