export type ClockHour = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type ClockCell = { ring: "center" } | { ring: "in" | "out"; hour: ClockHour };
export interface Movement {
  kind: "approach" | "evade";
  path: ClockCell[];
}
export interface MoveRoute {
  id: string;
  label: string;
  path: ClockCell[];
  cost: number;
}

export const CENTER: ClockCell = { ring: "center" };
export const START_CELL: ClockCell = { ring: "out", hour: 6 };
export const clockHour = (value: number): ClockHour => (((value - 1) % 12 + 12) % 12 + 1) as ClockHour;

export function cellLabel(cell: ClockCell): string {
  return cell.ring === "center" ? "中央" : `${cell.hour}${cell.ring}`;
}

export function sameCell(a: ClockCell, b: ClockCell): boolean {
  return cellLabel(a) === cellLabel(b);
}

export function approachPath(cell: ClockCell): ClockCell[] {
  if (cell.ring === "center") return [cell];
  return cell.ring === "out" ? [cell, { ring: "in", hour: cell.hour }, CENTER] : [cell, CENTER];
}

/** 通常移動3セル、超過移動6セル。中央に入った時点で必ず止まる。 */
export function attackRoutes(cell: ClockCell): MoveRoute[] {
  if (cell.ring === "center") return [
    { id: "direct", label: "その場で攻撃", path: [cell], cost: 0 },
    { id: "flank", label: "回り込んで攻撃", path: [cell, { ring: "in", hour: 6 }, { ring: "in", hour: 7 }, CENTER], cost: 0 },
    { id: "overdrive", label: "超過移動で回り込む", path: [cell, { ring: "in", hour: 6 }, { ring: "out", hour: 6 }, { ring: "out", hour: 7 }, { ring: "out", hour: 8 }, { ring: "in", hour: 8 }, CENTER], cost: 3 },
  ];
  const arc = (count: number): ClockCell[] => Array.from({ length: count }, (_, i) => ({ ring: cell.ring, hour: clockHour(cell.hour + i + 1) }));
  return [
    { id: "direct", label: "最短で接近", path: approachPath(cell), cost: 0 },
    { id: "flank", label: "回り込んで接近", path: cell.ring === "out"
      ? [cell, ...arc(1), { ring: "in", hour: clockHour(cell.hour + 1) }, CENTER]
      : [cell, ...arc(2), CENTER], cost: 0 },
    { id: "overdrive", label: "超過移動で接近", path: cell.ring === "out"
      ? [cell, ...arc(4), { ring: "in", hour: clockHour(cell.hour + 4) }, CENTER]
      : [cell, ...arc(5), CENTER], cost: 3 },
  ];
}

/** 中央から3セル移動。同じセルには戻らない。 */
export function evadePath(hour: ClockHour): ClockCell[] {
  return [CENTER, { ring: "in", hour }, { ring: "out", hour }, { ring: "out", hour: clockHour(hour + 1) }];
}

export function evadeRoutes(hour: ClockHour): MoveRoute[] {
  return [hour, clockHour(hour + 4), clockHour(hour + 8)].map((direction) => {
    const path = evadePath(direction);
    return { id: `evade-${direction}`, label: `${cellLabel(path[path.length - 1])}へ回避`, path, cost: 3 };
  });
}

/** 体験版の機銃は中央と3方位の内外周を狙う。範囲は攻撃前に固定して表示する。 */
export function sweepCells(round: number): ClockCell[] {
  const front = clockHour(6 + (Math.floor(round / 2) - 1) * 6);
  return [CENTER, ...[-1, 0, 1].flatMap((offset) => (["in", "out"] as const).map((ring) => ({ ring, hour: clockHour(front + offset) })))];
}

export function inAttackArea(cell: ClockCell, cells: ClockCell[]): boolean {
  return cells.some((target) => sameCell(cell, target));
}
