import { describe, expect, it } from "vitest";
import { JIG_THRUST_CELLS } from "@/data/character";
import { approachPath, cellLabel, evadePath, type ClockCell, type ClockHour } from "./position";

function adjacent(a: ClockCell, b: ClockCell) {
  if (a.ring === "center") return b.ring === "in";
  if (b.ring === "center") return a.ring === "in";
  if (a.ring !== b.ring) return a.hour === b.hour;
  return [1, 11].includes(Math.abs(a.hour - b.hour));
}

describe("自動移動とマップの位置", () => {
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
