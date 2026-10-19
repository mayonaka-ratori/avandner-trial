import { describe, it, expect } from "vitest";
import { createCombat, nextRound, playerAttack, resolveEnemyAttack } from "./combat";
import { readBattleSave } from "./battleSave";

describe("戦闘の保存の読み取り", () => {
  it("各段階の出目・位置・負けた回数・表示中の記録を保持する", () => {
    const miss = () => 0.95;
    const start = createCombat();
    const attack = playerAttack(start, "double", miss, "overdrive");
    const defense = resolveEnemyAttack(attack, "evade-10", miss);
    const next = nextRound(defense);
    const areaAttack = playerAttack(next, "slash", miss);
    const escape = resolveEnemyAttack(areaAttack, "evade-2", miss);
    for (const state of [start, attack, defense, next, areaAttack, escape]) {
      const data = JSON.parse(JSON.stringify({ version: 1, state, lostCount: 2, eventStart: 0 }));
      expect(readBattleSave(data)).toEqual(data);
    }
  });

  it("不完全な出目や移動経路を読み込んで画面を壊さない", () => {
    const state = playerAttack(createCombat(), "slash", () => 0.45);
    const save = { version: 1, state, lostCount: 0, eventStart: 1 };
    expect(readBattleSave({ ...save, state: { ...state, lastPlayerResult: [{ dice: null }] } })).toBeUndefined();
    expect(readBattleSave({ ...save, state: { ...state, lastMove: { kind: "evade", path: [null] } } })).toBeUndefined();
    expect(readBattleSave({ ...save, state: { ...state, pcZs: -1 } })).toBeUndefined();
    expect(readBattleSave({ ...save, eventStart: 10000 })).toBeUndefined();
    expect(readBattleSave(undefined)).toBeUndefined();
  });
});
