import { describe, expect, it } from "vitest";
import {
  attackOptionsFor,
  createCombat,
  nextRound,
  playerAttack,
  resolveEnemyAttack,
} from "./combat";
import { PC, ZAIRA } from "@/data/character";
import type { Rng } from "./dice";

/** 常に「1」を出す乱数＝全ダイス クリティカル */
const ALL_CRIT: Rng = () => 0.05;
/** 常に「10」を出す乱数＝全ダイス失敗 */
const ALL_MISS: Rng = () => 0.95;
/** 常に「5」を出す乱数＝目標値5にちょうど成功 */
const ALL_HIT5: Rng = () => 0.45;

describe("combat", () => {
  it("開始時はプレイヤーの手番で、ZS・耐久値は初期値", () => {
    const s = createCombat();
    expect(s.phase).toBe("player-turn");
    expect(s.pcZs).toBe(PC.zsMax);
    expect(s.zairaHp).toBe(ZAIRA.hp);
    expect(s.round).toBe(1);
  });

  it("攻撃すると敵にダメージが入り、回避選択へ進む", () => {
    const s = createCombat();
    const next = playerAttack(s, "slash", ALL_HIT5);
    expect(next.zairaHp).toBeLessThan(ZAIRA.hp);
    // ラウンド1の敵攻撃は副砲（回避可）なので evade-prompt
    expect(next.phase).toBe("evade-prompt");
  });

  it("全弾外れた場合でも敵の反撃フェイズへ進む", () => {
    const s = createCombat();
    const next = playerAttack(s, "slash", ALL_MISS);
    expect(next.zairaHp).toBe(ZAIRA.hp);
    expect(next.phase).toBe("evade-prompt");
  });

  it("ジグスラスト回避はコストを払い、敵の目標値を下げる", () => {
    let s = playerAttack(createCombat(), "slash", ALL_MISS);
    const zsBefore = s.pcZs;
    s = resolveEnemyAttack(s, true, ALL_MISS);
    // コスト3ぶんだけ減る（敵の攻撃は全部外れ）
    expect(s.pcZs).toBe(zsBefore - 3);
    expect(s.phase).toBe("enemy-resolved");
  });

  it("player-turn フェイズでは敵攻撃の解決を無視する（二重呼び出し防止）", () => {
    // UI から evade-prompt 以外で呼ばれても state をそのまま返す
    const s = createCombat();
    expect(s.phase).toBe("player-turn");
    expect(resolveEnemyAttack(s, true)).toBe(s);
    expect(resolveEnemyAttack(s, false)).toBe(s);
  });

  it("敵の攻撃で ZS が尽きると lost になる", () => {
    // プレイヤーは全弾外し、敵は全弾命中（出目1）する想定
    let s = playerAttack(createCombat(), "slash", ALL_MISS);
    let guard = 0;
    while (s.phase !== "lost" && guard < 20) {
      if (s.phase === "evade-prompt") s = resolveEnemyAttack(s, false, ALL_CRIT);
      if (s.phase === "enemy-resolved") s = nextRound(s);
      if (s.phase === "player-turn") s = playerAttack(s, "slash", ALL_MISS);
      guard += 1;
    }
    expect(s.pcZs).toBe(0);
    expect(s.phase).toBe("lost");
  });

  it("耐久値を削り切ると won になる", () => {
    // ALL_CRIT は出目1→成功+振り足しの連鎖で大ダメージになる
    let s = playerAttack(createCombat(), "slash", ALL_CRIT);
    let guard = 0;
    while (s.phase !== "won" && guard < 20) {
      if (s.phase === "evade-prompt") s = resolveEnemyAttack(s, false, ALL_MISS);
      if (s.phase === "enemy-resolved") s = nextRound(s);
      if (s.phase === "player-turn") s = playerAttack(s, "slash", ALL_CRIT);
      guard += 1;
    }
    expect(s.phase).toBe("won");
    expect(s.zairaHp).toBe(0);
  });

  it("ダブルトリガーは2回判定される", () => {
    const s = playerAttack(createCombat(), "double", ALL_HIT5);
    expect(s.lastPlayerResult).toHaveLength(2);
  });

  it("チャージアタックは突入（無防備）→解放の2ターン行動", () => {
    // 1ターン目：突入。ダメージなし、回避なしで敵の攻撃を受けて enemy-resolved へ
    let s = playerAttack(createCombat(), "charge", ALL_MISS);
    expect(s.charging).toBe(true);
    expect(s.zairaHp).toBe(ZAIRA.hp);
    expect(s.phase).toBe("enemy-resolved");

    // 2ターン目：選択肢は解放のみ
    s = nextRound(s);
    expect(attackOptionsFor(s)).toHaveLength(1);
    expect(attackOptionsFor(s)[0].mode).toBe("release");

    // 解放：威力30×3=90
    s = playerAttack(s, "release", ALL_HIT5);
    expect(s.charging).toBe(false);
    expect(s.lastPlayerResult?.[0].power).toBe(90);
    expect(s.zairaHp).toBeLessThan(ZAIRA.hp);
  });

  it("突入中は回避コストを払わずフルで被弾する", () => {
    const s = playerAttack(createCombat(), "charge", ALL_HIT5);
    // 敵の副砲（目標値5）が出目5で全弾命中する→ ZS が大きく減っている
    expect(s.pcZs).toBeLessThan(PC.zsMax - 10);
  });

  it("ラウンド2の敵攻撃は座標攻撃（機銃）で回避できない", () => {
    let s = playerAttack(createCombat(), "slash", ALL_MISS);
    s = resolveEnemyAttack(s, false, ALL_MISS);
    s = nextRound(s);
    s = playerAttack(s, "slash", ALL_MISS);
    // 座標攻撃は evade-prompt を飛ばして即解決される
    expect(s.phase).toBe("enemy-resolved");
  });
});
