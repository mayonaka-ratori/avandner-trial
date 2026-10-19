import { describe, expect, it } from "vitest";
import {
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
    s = resolveEnemyAttack(s, "evade-6", ALL_MISS);
    // コスト3ぶんだけ減る（敵の攻撃は全部外れ）
    expect(s.pcZs).toBe(zsBefore - 3);
    expect(s.phase).toBe("enemy-resolved");
  });

  it("player-turn フェイズでは敵攻撃の解決を無視する（二重呼び出し防止）", () => {
    // UI から evade-prompt 以外で呼ばれても state をそのまま返す
    const s = createCombat();
    expect(s.phase).toBe("player-turn");
    expect(resolveEnemyAttack(s, "evade-6")).toBe(s);
    expect(resolveEnemyAttack(s, "stay")).toBe(s);
  });

  it("敵の攻撃で ZS が尽きると lost になる", () => {
    // プレイヤーは全弾外し、敵は全弾命中（出目1）する想定
    let s = playerAttack(createCombat(), "slash", ALL_MISS);
    let guard = 0;
    while (s.phase !== "lost" && guard < 20) {
      if (s.phase === "evade-prompt") s = resolveEnemyAttack(s, "stay", ALL_CRIT);
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
      if (s.phase === "evade-prompt") s = resolveEnemyAttack(s, "stay", ALL_MISS);
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

  it("同じ手番の2セル移動で威力30＋2×3＝36になる。待ち時間や回避の制限はない", () => {
    const s = playerAttack(createCombat(), "slash", ALL_HIT5);
    expect(s.lastPlayerResult?.[0].power).toBe(36);
    expect(s.zairaHp).toBe(68);
    expect(s.phase).toBe("evade-prompt");
    const defended = resolveEnemyAttack(s, "evade-6", ALL_MISS);
    expect(defended.pcZs).toBe(70);
  });

  it("超過移動6セルは同じ手番に威力48で攻撃し、ZSを3だけ消費する", () => {
    const s = playerAttack(createCombat(), "slash", ALL_HIT5, "overdrive");
    expect(s.lastPlayerResult?.[0].power).toBe(48);
    expect(s.pcZs).toBe(70);
    expect(s.lastMove?.path).toHaveLength(7);
  });

  it("両手の黒絢に移動の加算が適用される。移動コストは二重に払わない", () => {
    const s = playerAttack(createCombat(), "double", () => 0.25, "overdrive");
    expect(s.lastPlayerResult?.map((r) => r.power)).toEqual([48, 48]);
    expect(s.pcZs).toBe(70);
  });

  it("前の手番の回避距離をチャージアタックに足さない", () => {
    let s = playerAttack(createCombat(), "slash", ALL_MISS);
    s = nextRound(resolveEnemyAttack(s, "evade-6", ALL_MISS));
    s = playerAttack(s, "slash", ALL_HIT5);
    expect(s.lastPlayerResult?.[0].power).toBe(36);
  });

  it("移動しなければ威力30。存在しない経路や不足するZSでは攻撃しない", () => {
    const s = { ...createCombat(), pcCell: { ring: "center" } as const };
    expect(playerAttack(s, "slash", ALL_HIT5).lastPlayerResult?.[0].power).toBe(30);
    expect(playerAttack(s, "slash", ALL_HIT5, "unknown")).toBe(s);
    const low = { ...createCombat(), pcZs: 3 };
    expect(playerAttack(low, "slash", ALL_HIT5, "overdrive")).toBe(low);
  });

  function coordinateTurn() {
    let s = playerAttack(createCombat(), "slash", ALL_MISS);
    s = nextRound(resolveEnemyAttack(s, "stay", ALL_MISS));
    return playerAttack(s, "slash", ALL_MISS);
  }

  it("座標攻撃は範囲外へ移動すれば、敵のダイスを振らずに外れる", () => {
    const rng = () => { throw new Error("範囲外では判定しない"); };
    const s = coordinateTurn();
    expect(s.phase).toBe("evade-prompt");
    const next = resolveEnemyAttack(s, "evade-10", rng);
    expect(next.pcCell).toEqual({ ring: "out", hour: 11 });
    expect(next.pcZs).toBe(70);
    expect(next.escapedArea).toBe(true);
    expect(next.lastEnemyResult).toBeUndefined();
    expect(next.phase).toBe("enemy-resolved");
  });

  it("座標攻撃の範囲内では、移動しても敵の目標値は下がらない", () => {
    const s = resolveEnemyAttack(coordinateTurn(), "evade-6", ALL_HIT5);
    expect(s.lastEnemyResult?.effectiveTarget).toBe(6);
    expect(s.lastEnemyResult?.penalty).toBe(0);
    expect(s.pcZs).toBe(38); // 回避3＋機銃(6成功×6−装甲4)32
    expect(s.escapedArea).toBe(false);
  });

  it("ZSの減少を回避の消費と被弾に分ける。解決済みの攻撃を再計算しない", () => {
    const s = resolveEnemyAttack(playerAttack(createCombat(), "slash", ALL_MISS), "evade-6", () => 0.15);
    expect(s.lastZsChange).toEqual({ before: 73, after: 32, movementCost: 3, damage: 38 });
    expect(resolveEnemyAttack(s, "evade-6", ALL_CRIT)).toBe(s);
  });

  it("接近と回避の位置を記録し、次の攻撃で中央へ戻る", () => {
    let s = createCombat();
    expect(s.pcCell).toEqual({ ring: "out", hour: 6 });
    s = playerAttack(s, "slash", ALL_MISS);
    expect(s.pcCell).toEqual({ ring: "center" });
    s = resolveEnemyAttack(s, "evade-6", ALL_MISS);
    expect(s.pcCell).toEqual({ ring: "out", hour: 7 });
    expect(s.lastMove?.path).toHaveLength(4);
    s = nextRound(s);
    s = playerAttack(s, "slash", ALL_MISS);
    expect(s.pcCell).toEqual({ ring: "center" });
    expect(s.approachHour).toBe(7);
  });

  it("結果を読む間はラウンドを進めず、次へ進んだときに更新する", () => {
    let s = playerAttack(createCombat(), "slash", ALL_MISS);
    s = resolveEnemyAttack(s, "stay", ALL_MISS);
    expect(s.round).toBe(1);
    s = nextRound(s);
    expect(s.round).toBe(2);
    expect(s.incoming.id).toBe("machine-gun");
    expect(s.lastPlayerResult).toBeUndefined();
    expect(s.lastEnemyResult).toBeUndefined();
  });
});
