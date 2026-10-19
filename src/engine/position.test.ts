import { describe, expect, it } from "vitest";
import { JIG_THRUST_CELLS } from "@/data/character";
import { approachPath, attackRoutes, cellLabel, evadePath, evadeRoutes, sweepCells, inAttackArea, type ClockCell, type ClockHour } from "./position";

function adjacent(a: ClockCell, b: ClockCell) {
  if (a.ring === "center") return b.ring === "in";
  if (b.ring === "center") return a.ring === "in";
  if (a.ring !== b.ring) return a.hour === b.hour;
  return [1, 11].includes(Math.abs(a.hour - b.hour));
}

describe("選べる経路とマップの位置", () => {
  it("中央でもその場の攻撃、通常移動、超過移動を選べる。中央に戻ると止まる", () => {
    const routes = attackRoutes({ ring: "center" });
    expect(routes.map((r) => r.path.length - 1)).toEqual([0, 3, 6]);
    for (const route of routes.slice(1)) {
      expect(route.path.slice(1, -1).every((c) => c.ring !== "center")).toBe(true);
      expect(route.path.at(-1)).toEqual({ ring: "center" });
      expect(route.path.slice(1).every((c, i) => adjacent(route.path[i], c))).toBe(true);
    }
  });
  it("全方位の接近経路は隣接セルだけを通り、中央に入った時点で止まる", () => {
    for (let hour = 1; hour <= 12; hour++) {
      for (const ring of ["in", "out"] as const) {
        const routes = attackRoutes({ hour: hour as ClockHour, ring });
        expect(routes.map((r) => r.path.length - 1)).toEqual([ring === "in" ? 1 : 2, 3, 6]);
        for (const route of routes) {
          expect(route.path.at(-1)).toEqual({ ring: "center" });
          expect(route.path.slice(0, -1).every((c) => c.ring !== "center")).toBe(true);
          expect(route.path.slice(1).every((c, i) => adjacent(route.path[i], c))).toBe(true);
        }
      }
    }
  });

  it("機銃の範囲と回避先を比較でき、同じ範囲に残る経路と逃げる経路がある", () => {
    const cells = sweepCells(2);
    expect(cells.map(cellLabel)).toEqual(["中央", "5in", "5out", "6in", "6out", "7in", "7out"]);
    expect(evadeRoutes(6).map((route) => inAttackArea(route.path.at(-1)!, cells))).toEqual([true, false, false]);
  });
  it("どの方位からも隣接するマスだけを通って接近し、中央で止まる", () => {
    for (let hour = 1; hour <= 12; hour++) {
      for (const ring of ["in", "out"] as const) {
        const path = approachPath({ hour: hour as ClockHour, ring });
        expect(path.at(-1)).toEqual({ ring: "center" });
        expect(path.slice(1).every((cell, i) => adjacent(path[i], cell))).toBe(true);
      }
    }
  });

  it("回避は3セル分、同じマスを再度通らず移動する。12時の隣は1時", () => {
    for (let hour = 1; hour <= 12; hour++) {
      const path = evadePath(hour as ClockHour);
      expect(path.length - 1).toBe(JIG_THRUST_CELLS);
      expect(new Set(path.map(cellLabel)).size).toBe(path.length);
      expect(path.slice(1).every((cell, i) => adjacent(path[i], cell))).toBe(true);
    }
    expect(evadePath(12).at(-1)).toEqual({ ring: "out", hour: 1 });
  });
});
