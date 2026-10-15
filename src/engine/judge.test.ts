import { describe, expect, it } from "vitest";
import { judgeAttack } from "./judge";

const ALL_HIT5 = () => 0.45; // 出目5
const ALL_CRIT = () => 0.05; // 出目1
const ALL_MISS = () => 0.95; // 出目10

describe("judgeAttack（移植の動作確認）", () => {
  it("目標値以下が成功になる", () => {
    const j = judgeAttack({ burst: 2, target: 5, power: 30, rng: ALL_HIT5 });
    expect(j.successes).toBe(2);
    expect(j.appliedDamage).toBe(60);
  });

  it("出目1は成功＋振り足しになる", () => {
    const j = judgeAttack({ burst: 2, target: 5, power: 30, rng: ALL_CRIT });
    // 2+2+2... 連鎖は MAX_EXTRA_DICE=100 で打ち切られる
    expect(j.truncated).toBe(true);
    expect(j.successes).toBe(102);
  });

  it("実効目標値が0以下なら自動失敗", () => {
    const j = judgeAttack({ burst: 2, target: 2, penalty: 3, rng: ALL_HIT5 });
    expect(j.autoFail).toBe(true);
    expect(j.dice).toHaveLength(0);
  });

  it("目標値は9に丸められる", () => {
    const j = judgeAttack({ burst: 1, target: 15, rng: ALL_MISS });
    expect(j.effectiveTarget).toBe(9);
    // 出目10は9より大きいので失敗
    expect(j.successes).toBe(0);
  });

  it("ダメージ軽減は0を下回らない", () => {
    const j = judgeAttack({
      burst: 1,
      target: 5,
      power: 2,
      damageReduction: 50,
      rng: ALL_HIT5,
    });
    expect(j.appliedDamage).toBe(0);
  });
});
