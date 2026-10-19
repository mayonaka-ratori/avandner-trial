import { useId } from "react";
import { cellLabel, inAttackArea, type ClockCell, type ClockHour } from "@/engine/position";
import type { CombatState } from "@/engine/combat";

const HOURS: ClockHour[] = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function point(hour: number, radius: number) {
  const angle = (hour * 30 - 90) * Math.PI / 180;
  return { x: 130 + Math.cos(angle) * radius, y: 130 + Math.sin(angle) * radius };
}

function cellPoint(cell: ClockCell) {
  return cell.ring === "center" ? { x: 130, y: 130 } : point(cell.hour, cell.ring === "in" ? 52 : 89);
}

function wedge(hour: number, inner: number, outer: number) {
  const a = point(hour - 0.5, inner), b = point(hour - 0.5, outer);
  const c = point(hour + 0.5, outer), d = point(hour + 0.5, inner);
  return `M${a.x},${a.y} L${b.x},${b.y} A${outer},${outer} 0 0 1 ${c.x},${c.y} L${d.x},${d.y} A${inner},${inner} 0 0 0 ${a.x},${a.y} Z`;
}

/** 中央1・内周12・外周12セル。位置は戦闘の状態から描画する。 */
export function BattleMap({ state, previewPath }: { state: CombatState; previewPath?: ClockCell[] }) {
  const titleId = useId();
  const dangerId = useId();
  const pc = cellPoint(state.pcCell);
  const central = state.pcCell.ring === "center";
  const trail = state.lastMove?.path.map((cell) => {
    const p = cellPoint(cell);
    return `${p.x},${p.y}`;
  }).join(" ");
  const preview = previewPath?.map((cell) => { const p = cellPoint(cell); return `${p.x},${p.y}`; }).join(" ");
  const area = state.incomingCells;
  return (
    <figure className="battle-map">
      <svg viewBox="0 0 260 260" role="img" aria-labelledby={titleId}>
        <title id={titleId}>ダイアクロックマップ。あなた：{cellLabel(state.pcCell)}。ザイラ：中央。{area.length > 0 ? `攻撃範囲：${area.map(cellLabel).join("、")}。` : ""}{previewPath ? `選んだ経路：${previewPath.map(cellLabel).join("、")}` : ""}</title>
        <defs><pattern id={dangerId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="6" fill="#44231c" /><line x1="0" y1="0" x2="0" y2="6" stroke="#ed9c83" strokeWidth="2" /></pattern></defs>
        {HOURS.flatMap((hour) => (["in", "out"] as const).map((ring) => (
          <path key={`${hour}${ring}`} d={wedge(hour, ring === "in" ? 29 : 72, ring === "in" ? 72 : 108)}
            style={inAttackArea({ ring, hour }, area) ? { fill: `url(#${dangerId})` } : undefined}
            className={state.pcCell.ring === ring && state.pcCell.hour === hour ? "map-cell map-cell-current" : "map-cell"} />
        )))}
        <circle cx="130" cy="130" r="29" className={`map-cell ${central ? "map-cell-current" : ""}`} style={inAttackArea({ ring: "center" }, area) ? { fill: `url(#${dangerId})` } : undefined} />
        {HOURS.map((hour) => {
          const p = point(hour, 121);
          return <text key={hour} x={p.x} y={p.y} className="map-hour">{hour}</text>;
        })}
        {trail && <polyline points={trail} className="map-trail" />}
        {preview && <polyline points={preview} className="map-trail map-trail-preview" />}
        <g transform="translate(130,119)" className={state.zairaHp === 0 ? "map-unit-stopped" : ""}>
          <path d="M0,-11 L12,0 L0,11 L-12,0 Z" className="map-enemy" />
          <text x="0" y="1" className="map-unit-text">敵</text>
        </g>
        <g transform={`translate(${pc.x},${pc.y + (central ? 13 : 0)})`} className={state.pcZs === 0 ? "map-unit-stopped" : ""}>
          <path d="M0,-12 L13,10 L-13,10 Z" className="map-player" />
          <text x="0" y="3" className="map-unit-text">自</text>
        </g>
        <text x="130" y="78" className="map-ring-label">内周</text>
        <text x="130" y="34" className="map-ring-label">外周</text>
      </svg>
      <figcaption><span className="map-player-label">▲ あなた</span><span className="map-enemy-label">◆ ザイラ（中央）</span>{area.length > 0 && <span className="map-danger-label">斜線：攻撃範囲</span>}{previewPath && previewPath.length > 1 && <span className="map-preview-label">点線：選んだ経路</span>}</figcaption>
    </figure>
  );
}
