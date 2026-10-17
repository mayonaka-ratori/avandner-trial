import { useEffect, useReducer, useRef, useState } from "react";
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
  const [shaking, setShaking] = useState(false);
  const prevZs = useRef(state.pcZs);

  // 被弾したら画面を軽く揺らす
  useEffect(() => {
    if (state.pcZs < prevZs.current) setShaking(true);
    prevZs.current = state.pcZs;
  }, [state.pcZs]);

  const hpPct = Math.max(0, Math.round((state.zairaHp / ZAIRA.hp) * 100));
  const zsPct = Math.max(0, Math.round((state.pcZs / PC.zsMax) * 100));

  const playerDamage =
    state.lastPlayerResult?.reduce((s, j) => s + (j.appliedDamage ?? 0), 0) ?? 0;
  const enemyDamage = state.lastEnemyResult?.appliedDamage ?? 0;

  return (
    <div
      className={`mt-6 space-y-5 border-t border-hud-border pt-6 ${shaking ? "hud-shake" : ""}`}
      onAnimationEnd={(e) => {
        if (e.animationName === "hudShake") setShaking(false);
      }}
    >
      {/* 敵味方のゲージ */}
      <div className="relative space-y-2">
        <Gauge
          label={`${ZAIRA.name}（敵）`}
          value={state.zairaHp}
          max={ZAIRA.hp}
          pct={hpPct}
          color="copper"
        />
        <div className="relative">
          <Gauge
            label="あなたのジアドスフィア"
            value={state.pcZs}
            max={PC.zsMax}
            pct={zsPct}
            color="gold"
            flash={shaking}
          />
          {state.charging && (
            <span className="absolute -top-1 right-0 rounded border border-hud-warning/60 bg-hud-warning/10 px-1.5 py-0.5 font-mono-hud text-[10px] tracking-[0.2em] text-hud-warning">
              EXPOSED
            </span>
          )}
        </div>
        {/* ダメージ数字のポップ（ゲージの数値と重ならないよう右からずらす） */}
        {playerDamage > 0 && state.phase !== "player-turn" && (
          <span
            key={`pdmg-${state.round}-${state.log.length}`}
            className="damage-pop absolute -top-3 right-16 font-mono-hud text-lg font-bold text-hud-gold-bright"
          >
            -{playerDamage}
          </span>
        )}
        {enemyDamage > 0 && (
          <span
            key={`edmg-${state.round}-${state.log.length}`}
            className="damage-pop absolute bottom-6 right-16 font-mono-hud text-lg font-bold text-hud-warning"
          >
            -{enemyDamage}
          </span>
        )}
      </div>

      <p className="text-center font-mono-hud text-xs tracking-[0.2em] text-hud-text-muted">
        ROUND {state.round}
      </p>

      {/* ログ（末尾だけ見せる） */}
      <BattleLog state={state} />

      {/* プレイヤーの手番 */}
      {state.phase === "player-turn" && (
        <div className="space-y-2">
          <div className="rounded-md border border-hud-gold/40 bg-hud-gold/5 px-3 py-2">
            <p className="font-mono-hud text-[11px] tracking-[0.3em] text-hud-gold">
              YOUR TURN
            </p>
            <p className="mt-0.5 text-sm text-hud-text">
              {state.charging
                ? "――突入中。溜めた一撃を解放する。"
                : "――あなたの手番。どう攻める？"}
            </p>
            <p className="mt-1 text-xs text-hud-text-muted">
              敵の攻撃予告：{state.incoming.label}
              {state.incoming.coordinateAttack && (
                <span className="ml-1 text-hud-warning">
                  （ジグスラストで回避不能）
                </span>
              )}
            </p>
          </div>
          {attackOptionsFor(state).map((opt) => (
            <button
              key={opt.mode}
              onClick={() => dispatch({ type: "attack", mode: opt.mode })}
              className="block w-full rounded-md border border-hud-gold/40 bg-hud-gold/10 px-4 py-3.5 text-left transition-colors hover:bg-hud-gold/20"
            >
              <span className="flex items-center gap-2">
                <span className="text-sm font-medium text-hud-gold-bright">{opt.label}</span>
                {opt.mode === "double" && (
                  <span className="rounded border border-hud-gold/40 px-1 py-px font-mono-hud text-[10px] text-hud-gold">
                    2回判定
                  </span>
                )}
                {opt.mode === "charge" && (
                  <span className="rounded border border-hud-warning/50 px-1 py-px font-mono-hud text-[10px] text-hud-warning">
                    無防備
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-hud-text-muted">{opt.hint}</span>
            </button>
          ))}
        </div>
      )}

      {/* 回避選択（敵の攻撃予告つき） */}
      {state.phase === "evade-prompt" && (
        <div className="space-y-2">
          <p className="alert-pulse rounded border border-hud-warning/60 bg-hud-warning/10 px-3 py-2 font-mono-hud text-xs tracking-[0.2em] text-hud-warning">
            WARNING // {state.incoming.label}
            <span className="mt-1 block text-[13px] font-normal normal-case tracking-normal text-hud-text">
              {state.incoming.flavor}
            </span>
          </p>
          <p className="text-sm text-hud-text">
            敵の攻撃が来る。ジグスラストで回避する？（コスト：ZS −{JIG_THRUST_COST}）
          </p>
          <button
            onClick={() => dispatch({ type: "evade", evade: true })}
            disabled={state.pcZs <= JIG_THRUST_COST}
            className="flex w-full items-center gap-2 rounded-md border border-hud-gold/40 bg-hud-gold/10 px-4 py-3.5 text-left transition-colors hover:bg-hud-gold/20 disabled:opacity-40"
          >
            <Zap size={16} className="shrink-0 text-hud-gold-bright" />
            <span>
              <span className="block text-sm font-medium text-hud-gold-bright">ジグスラストで回避する</span>
              <span className="text-xs text-hud-text-muted">
                {state.pcZs <= JIG_THRUST_COST
                  ? `残りZSがコスト以下のため使えない（払うと機関停止する）`
                  : `敵の目標値 −${JIG_THRUST_CELLS}。避けられる可能性が上がる`}
              </span>
            </span>
          </button>
          <button
            onClick={() => dispatch({ type: "evade", evade: false })}
            className="flex w-full items-center gap-2 rounded-md border border-hud-border bg-hud-panel px-4 py-3.5 text-left transition-colors hover:border-hud-copper/60"
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
          className="flex w-full items-center justify-center gap-1 rounded-md border border-hud-gold/50 bg-hud-gold/20 px-6 py-3.5 font-medium text-hud-gold-bright transition-colors hover:bg-hud-gold/30"
        >
          次のラウンドへ
          <ChevronRight size={16} />
        </button>
      )}

      {/* 勝利 */}
      {state.phase === "won" && (
        <div className="space-y-3">
          <p className="stamp-in text-center font-mono-hud text-lg tracking-[0.35em] text-hud-gold-bright">
            TARGET NEUTRALIZED
          </p>
          <p className="text-center text-sm text-hud-text-muted">―― ザイラ、撃破 ――</p>
          <button
            onClick={() => onEnd(lostCount > 0 ? "lost-then-won" : "won")}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-hud-gold/50 bg-hud-gold/20 px-6 py-3.5 font-medium text-hud-gold-bright transition-colors hover:bg-hud-gold/30"
          >
            エンディングへ
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* 敗北（リトライ可） */}
      {state.phase === "lost" && (
        <div className="space-y-3">
          <p className="stamp-in text-center font-mono-hud text-lg tracking-[0.35em] text-hud-warning">
            SYSTEM FAILURE
          </p>
          <p className="text-center text-sm leading-relaxed text-hud-warning">
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
            className="flex w-full items-center justify-center gap-2 rounded-md border border-hud-gold/50 bg-hud-gold/20 px-6 py-3.5 font-medium text-hud-gold-bright transition-colors hover:bg-hud-gold/30"
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
  flash,
}: {
  label: string;
  value: number;
  max: number;
  pct: number;
  color: "gold" | "copper";
  flash?: boolean;
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
          className={`h-full rounded-full ${barColor} transition-all duration-500 ${flash ? "gauge-flash" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function BattleLog({ state }: { state: CombatState }) {
  // 直近のラウンドぶんだけ見せる（長くなりすぎないように）
  const shown = state.log.filter((e) => e.round >= state.round - 1).slice(-8);
  const boxRef = useRef<HTMLDivElement>(null);
  // 新しいログが来たらボックス内を最下部へ（ページではなくログ内だけをスクロール）
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.log.length]);
  return (
    <div
      ref={boxRef}
      className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-hud-border bg-hud-panel/60 p-3"
    >
      <p className="font-mono-hud text-[10px] tracking-[0.3em] text-hud-gold-dim">
        COMBAT LOG
      </p>
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
          className={`die-in flex h-7 w-7 items-center justify-center rounded border font-mono-hud text-xs ${
            d.isCritical
              ? "die-crit border-hud-gold-bright bg-hud-gold/30 font-bold text-hud-gold-bright"
              : d.isSuccess
                ? "border-hud-gold/50 bg-hud-gold/10 text-hud-gold-bright"
                : "border-hud-border text-hud-text-muted"
          }`}
          style={{ animationDelay: `${i * 90}ms` }}
          title={d.wave > 0 ? `振り足し${d.wave}回目` : undefined}
        >
          {d.value}
        </span>
      ))}
      <span className="ml-1 text-xs text-hud-text-muted">
        成功{judgement.successes}
        {judgement.criticals > 0 && `・クリティカル${judgement.criticals}`}
        {judgement.appliedDamage !== null && `・${judgement.appliedDamage}ダメージ`}
      </span>
    </div>
  );
}
