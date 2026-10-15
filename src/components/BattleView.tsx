import { useReducer, useState } from "react";
import { Shield, Zap, RotateCcw, ChevronRight } from "lucide-react";
import {
  attackOptionsFor,
  createCombat,
  nextRound,
  playerAttack,
  resolveEnemyAttack,
  type CombatState,
} from "@/engine/combat";
import { JIG_THRUST_CELLS, JIG_THRUST_COST, PC, ZAIRA } from "@/data/character";
import type { AttackJudgement, JudgeDie } from "@/engine/judge";

interface BattleViewProps {
  onEnd: (result: "won" | "lost-then-won") => void;
}

type Action =
  | { type: "attack"; mode: "slash" | "double" | "charge" | "release" }
  | { type: "evade"; evade: boolean }
  | { type: "next" }
  | { type: "retry" };

function reducer(state: CombatState, action: Action): CombatState {
  switch (action.type) {
    case "attack":
      return playerAttack(state, action.mode);
    case "evade":
      return resolveEnemyAttack(state, action.evade);
    case "next":
      return nextRound(state);
    case "retry":
      return createCombat();
  }
}

/** 戦闘画面。攻撃→（回避選択）→敵攻撃、をラウンド単位で回す */
export function BattleView({ onEnd }: BattleViewProps) {
  const [state, dispatch] = useReducer(reducer, undefined, createCombat);
  const [lostCount, setLostCount] = useState(0);

  const hpPct = Math.max(0, Math.round((state.zairaHp / ZAIRA.hp) * 100));
  const zsPct = Math.max(0, Math.round((state.pcZs / PC.zsMax) * 100));

  return (
    <div className="mt-6 space-y-5 border-t border-hud-border pt-6">
      {/* 敵味方のゲージ */}
      <div className="space-y-2">
        <Gauge label={`${ZAIRA.name}（敵）`} value={state.zairaHp} max={ZAIRA.hp} pct={hpPct} color="copper" />
        <Gauge label={`あなたのジアドスフィア`} value={state.pcZs} max={PC.zsMax} pct={zsPct} color="gold" />
      </div>

      <p className="text-center text-xs tracking-[0.2em] text-hud-text-muted">
        ラウンド {state.round}
      </p>

      {/* ログ（末尾だけ見せる） */}
      <BattleLog state={state} />

      {/* プレイヤーの手番 */}
      {state.phase === "player-turn" && (
        <div className="space-y-2">
          <p className="text-sm text-hud-text-muted">
            {state.charging
              ? "――突入中。溜めた一撃を解放する。"
              : "――あなたの手番。どう攻める？"}
          </p>
          {attackOptionsFor(state).map((opt) => (
            <button
              key={opt.mode}
              onClick={() => dispatch({ type: "attack", mode: opt.mode })}
              className="block w-full rounded-md border border-hud-gold/40 bg-hud-gold/10 px-4 py-3 text-left transition-colors hover:bg-hud-gold/20"
            >
              <span className="text-sm font-medium text-hud-gold-bright">{opt.label}</span>
              <span className="mt-0.5 block text-xs text-hud-text-muted">{opt.hint}</span>
            </button>
          ))}
        </div>
      )}

      {/* 回避選択 */}
      {state.phase === "evade-prompt" && (
        <div className="space-y-2">
          <p className="text-sm text-hud-text-muted">
            敵の攻撃が来る。ジグスラストで回避する？（コスト：ZS −{JIG_THRUST_COST}）
          </p>
          <button
            onClick={() => dispatch({ type: "evade", evade: true })}
            className="flex w-full items-center gap-2 rounded-md border border-hud-gold/40 bg-hud-gold/10 px-4 py-3 text-left transition-colors hover:bg-hud-gold/20"
          >
            <Zap size={16} className="shrink-0 text-hud-gold-bright" />
            <span>
              <span className="block text-sm font-medium text-hud-gold-bright">ジグスラストで回避する</span>
              <span className="text-xs text-hud-text-muted">敵の目標値 −{JIG_THRUST_CELLS}。避けられる可能性が上がる</span>
            </span>
          </button>
          <button
            onClick={() => dispatch({ type: "evade", evade: false })}
            className="flex w-full items-center gap-2 rounded-md border border-hud-border bg-hud-panel px-4 py-3 text-left transition-colors hover:border-hud-copper/60"
          >
            <Shield size={16} className="shrink-0 text-hud-text-muted" />
            <span>
              <span className="block text-sm text-hud-text">そのまま受ける</span>
              <span className="text-xs text-hud-text-muted">コストを払わず、ダメージ軽減で耐える</span>
            </span>
          </button>
        </div>
      )}

      {/* ラウンド終了 */}
      {state.phase === "enemy-resolved" && (
        <button
          onClick={() => dispatch({ type: "next" })}
          className="flex w-full items-center justify-center gap-1 rounded-md border border-hud-gold/50 bg-hud-gold/10 px-6 py-3 text-hud-gold-bright transition-colors hover:bg-hud-gold/20"
        >
          次のラウンドへ
          <ChevronRight size={16} />
        </button>
      )}

      {/* 勝利 */}
      {state.phase === "won" && (
        <div className="space-y-3">
          <p className="text-center text-lg text-hud-gold-bright">―― ザイラ、撃破 ――</p>
          <button
            onClick={() => onEnd(lostCount > 0 ? "lost-then-won" : "won")}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-hud-gold/50 bg-hud-gold/20 px-6 py-3 text-hud-gold-bright transition-colors hover:bg-hud-gold/30"
          >
            エンディングへ
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* 敗北（リトライ可） */}
      {state.phase === "lost" && (
        <div className="space-y-3">
          <p className="text-center text-sm leading-relaxed text-hud-copper">
            機関停止。――だが、姉貴分があなたの機体を引きずって退避させる。
            <br />
            まだ、やり直せる。
          </p>
          <p className="text-center text-xs leading-relaxed text-hud-text-muted">
            ヒント：敵の攻撃に「ジグスラストで回避する」を使うと、被弾がぐっと減ります。
            大きく削りたいときは「チャージアタック」。
          </p>
          <button
            onClick={() => {
              setLostCount((c) => c + 1);
              dispatch({ type: "retry" });
            }}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-hud-copper/50 bg-hud-copper/10 px-6 py-3 text-hud-copper transition-colors hover:bg-hud-copper/20"
          >
            <RotateCcw size={16} />
            もう一度挑戦する
          </button>
        </div>
      )}
    </div>
  );
}

function Gauge({
  label,
  value,
  max,
  pct,
  color,
}: {
  label: string;
  value: number;
  max: number;
  pct: number;
  color: "gold" | "copper";
}) {
  const barColor = color === "gold" ? "bg-hud-gold" : "bg-hud-copper";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-hud-text-muted">{label}</span>
        <span className="text-hud-text">
          {value} / {max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-hud-panel">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function BattleLog({ state }: { state: CombatState }) {
  // 直近のラウンドぶんだけ見せる（長くなりすぎないように）
  const shown = state.log.filter((e) => e.round >= state.round - 1).slice(-8);
  return (
    <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-hud-border bg-hud-panel/60 p-3">
      {shown.map((entry, i) => (
        <div key={i} className="beat-in">
          <p
            className={`text-xs leading-relaxed ${
              entry.actor === "pc"
                ? "text-hud-gold-bright/90"
                : entry.actor === "zaira"
                  ? "text-hud-copper/90"
                  : "text-hud-text-muted"
            }`}
          >
            {entry.text}
          </p>
          {entry.judgement && <DiceRow judgement={entry.judgement} />}
        </div>
      ))}
    </div>
  );
}

function DiceRow({ judgement }: { judgement: AttackJudgement }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {judgement.dice.map((d: JudgeDie, i: number) => (
        <span
          key={i}
          className={`flex h-6 w-6 items-center justify-center rounded border text-[11px] ${
            d.isCritical
              ? "border-hud-gold-bright bg-hud-gold/30 font-bold text-hud-gold-bright"
              : d.isSuccess
                ? "border-hud-gold/50 bg-hud-gold/10 text-hud-gold-bright"
                : "border-hud-border text-hud-text-muted"
          }`}
          title={d.wave > 0 ? `振り足し${d.wave}回目` : undefined}
        >
          {d.value}
        </span>
      ))}
      <span className="ml-1 text-[10px] text-hud-text-muted">
        成功{judgement.successes}
        {judgement.criticals > 0 && `・クリティカル${judgement.criticals}`}
        {judgement.appliedDamage !== null && `・${judgement.appliedDamage}ダメージ`}
      </span>
    </div>
  );
}
