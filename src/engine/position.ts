export type ClockHour = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type ClockCell = { ring: "center" } | { ring: "in" | "out"; hour: ClockHour };
export interface Movement {
  kind: "approach" | "evade";
  path: ClockCell[];
}

export const CENTER: ClockCell = { ring: "center" };
export const START_CELL: ClockCell = { ring: "out", hour: 6 };

export function cellLabel(cell: ClockCell): string {
  return cell.ring === "center" ? "中央" : `${cell.hour}${cell.ring}`;
}

/** 体験版では接近先と回避先を自動で選ぶ。攻撃は射程0の中央まで接近する。 */
export function approachPath(cell: ClockCell): ClockCell[] {
  if (cell.ring === "center") return [cell];
  return cell.ring === "out" ? [cell, { ring: "in", hour: cell.hour }, CENTER] : [cell, CENTER];
}

/** 中央→内周→外周→隣の外周で3セル。同じセルを再度通らない。 */
export function evadePath(hour: ClockHour): ClockCell[] {
  const nextHour = (hour === 12 ? 1 : hour + 1) as ClockHour;
  return [CENTER, { ring: "in", hour }, { ring: "out", hour }, { ring: "out", hour: nextHour }];
}
