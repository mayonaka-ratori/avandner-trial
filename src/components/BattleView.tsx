import { useEffect, useRef, useState } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import { attackOptionsFor, createCombat, nextRound, playerAttack, resolveEnemyAttack, type AttackMode, type CombatLogEntry, type CombatState } from "@/engine/combat";
import { CHARGE_ATTACK_MULTIPLIER, DOUBLE_TRIGGER_PENALTY, JIG_THRUST_CELLS, JIG_THRUST_COST, KUROAYA, PC, ZAIRA } from "@/data/character";
import { cellLabel } from "@/engine/position";
import { BattleMap } from "./BattleMap";
import { BattleDice, TenSidedDie } from "./BattleDice";

type Pending = { type: "attack"; mode: AttackMode } | { type: "enemy"; evade: boolean };
const ROLL_MS = import.meta.env.MODE === "test" ? 0 : 700;

export function BattleView({ onEnd }: { onEnd: (result: "won" | "lost-then-won") => void }) {
  const [state, setState] = useState(createCombat);
  const [lostCount, setLostCount] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [rolling, setRolling] = useState(false);
  const [eventStart, setEventStart] = useState(0);
  const rollLock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const resultRef = useRef<HTMLElement>(null);
  const controlsRef = useRef<HTMLElement>(null);
  const rollButtonRef = useRef<HTMLButtonElement>(null);
  const previousLogLength = useRef(state.log.length);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (state.log.length > previousLogLength.current) {
      resultRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({ block: "start" });
    }
    previousLogLength.current = state.log.length;
  }, [state.log.length]);

  useEffect(() => {
    if (pending) {
      controlsRef.current?.scrollIntoView({ block: "nearest" });
      rollButtonRef.current?.focus({ preventScroll: true });
    }
  }, [pending]);

  function apply(action: Pending) {
    // 乱数を使う計算は更新関数の外で一度だけ行う。StrictModeで振り直さない。
    const next = action.type === "attack" ? playerAttack(state, action.mode) : resolveEnemyAttack(state, action.evade);
    setEventStart(state.log.length);
    setState(next);
    setPending(null);
  }

  function roll(action: Pending) {
    if (rollLock.current) return;
    rollLock.current = true;
    setRolling(true);
    timer.current = setTimeout(() => {
      apply(action);
      setRolling(false);
      rollLock.current = false;
    }, ROLL_MS);
  }

  const step = phaseLabel(state);
  const active: Pending | null = pending ?? (state.phase === "enemy-ready" ? { type: "enemy", evade: false } : null);
  const latest = state.log.slice(eventStart);
  const rollInfo = active ? describeRoll(state, active) : null;

  return (
    <section className="battle-screen" aria-label="ザイラとの戦闘">
      <h2 className="battle-title">ザイラとの戦闘</h2>
      <div className="battle-overview">
        <BattleMap state={state} />
        <div className="battle-readout">
          <p className="battle-round">第{state.round}ラウンド<span className="battle-phase">{shortPhase(state)}</span></p>
          <Gauge label="ザイラの耐久値" value={state.zairaHp} max={ZAIRA.hp} enemy />
          <Gauge label="あなたのジアドスフィア" value={state.pcZs} max={PC.zsMax} />
          <p className="battle-position">あなた：<strong>{cellLabel(state.pcCell)}</strong><br />ザイラ：中央</p>
          <p className="battle-map-note">移動先は自動で選びます</p>
        </div>
      </div>

      <p className="battle-step" role="status" aria-live="polite">{rolling ? "10面ダイスを振っています…" : step}</p>

      <section ref={resultRef} tabIndex={-1} className="battle-latest" aria-label="直前の結果">
        <h3>{state.log.length === 1 ? "戦闘の目的" : "直前の結果"}</h3>
        {latest.map((entry, i) => <ResultEntry key={`${eventStart}-${i}`} entry={entry} />)}
      </section>

      <section ref={controlsRef} className="battle-controls" aria-label="次の行動">
        {!active && state.phase === "player-turn" && <>
          <h3>{state.charging ? "溜めた一撃を放ちます" : "攻撃を選んでください"}</h3>
          <p className="battle-hint">{state.pcCell.ring !== "center" && "中央まで接近して攻撃します。"}敵の次の攻撃：<strong>{state.incoming.label}</strong>{state.incoming.coordinateAttack && "（回避できません）"}</p>
          <div className="battle-action-list">
            {attackOptionsFor(state).map((option) => (
              <button key={option.mode} onClick={() => setPending({ type: "attack", mode: option.mode })} className="battle-action">
                <span className="battle-action-name">{option.label}</span>
                <span>{attackHint(option.mode)}</span>
              </button>
            ))}
          </div>
        </>}

        {!active && state.phase === "evade-prompt" && <>
          <h3>ザイラが{state.incoming.label}で反撃します</h3>
          <p className="battle-hint">回避するか選んでから、敵のダイスを振ります。</p>
          <div className="battle-action-list">
            <button className="battle-action" disabled={state.pcZs <= JIG_THRUST_COST} onClick={() => setPending({ type: "enemy", evade: true })}>
              <span className="battle-action-name">ジグスラストで回避する</span>
              <span>{state.pcZs <= JIG_THRUST_COST ? "ジアドスフィアが足りません" : `3セル移動して当たりにくくする。ジアドスフィアを${JIG_THRUST_COST}消費`}</span>
            </button>
            <button className="battle-action" onClick={() => setPending({ type: "enemy", evade: false })}>
              <span className="battle-action-name">そのまま受ける</span>
              <span>回避のための消費なし。命中した分のダメージを受けます</span>
            </button>
          </div>
        </>}

        {active && rollInfo && <div className="battle-roll-panel" aria-busy={rolling}>
          <h3>{rollInfo.title}</h3>
          <p>{rollInfo.description}</p>
          {active.type === "enemy" && state.phase === "enemy-ready" && <p className="battle-hint">{state.charging ? "突入中のため回避できません。" : "広い範囲への攻撃のため回避できません。"}</p>}
          {active.type === "attack" && active.mode === "charge" ? (
            <button ref={rollButtonRef} className="battle-primary" onClick={() => apply(active)}>突入する<ChevronRight size={16} /></button>
          ) : <>
            <div className="battle-rolling-dice" aria-hidden="true">
              {Array.from({ length: Math.min(rollInfo.count, 8) }, (_, i) => <TenSidedDie key={i} rolling={rolling} />)}
            </div>
            <button ref={rollButtonRef} className="battle-primary" disabled={rolling} onClick={() => roll(active)}>
              {rolling ? "ダイスを振っています…" : "ダイスを振る"}
            </button>
          </>}
          {pending && <button className="battle-reselect" disabled={rolling} onClick={() => setPending(null)}>選び直す</button>}
        </div>}

        {state.phase === "enemy-resolved" && <button className="battle-primary" onClick={() => setState(nextRound(state))}>次のラウンドへ<ChevronRight size={16} /></button>}
        {state.phase === "won" && <>
          <h3>ザイラを撃破しました</h3>
          <p>装甲列車を守りました。</p>
          <button className="battle-primary" onClick={() => onEnd(lostCount > 0 ? "lost-then-won" : "won")}>エンディングへ<ChevronRight size={16} /></button>
        </>}
        {state.phase === "lost" && <>
          <h3>機関停止。姉貴分があなたを救出しました</h3>
          <p>もう一度挑戦できます。回避できる攻撃にはジグスラストを試してみてください。</p>
          <button className="battle-primary" onClick={() => {
            setLostCount((count) => count + 1);
            setState(createCombat());
            setEventStart(0);
            setPending(null);
            window.scrollTo({ top: 0 });
          }}><RotateCcw size={16} />もう一度挑戦する</button>
        </>}
      </section>

      <details className="battle-history">
        <summary>これまでの戦闘記録（{state.log.length}件）</summary>
        <ol>{state.log.map((entry, i) => <li key={i}><span>第{entry.round}ラウンド・{actorLabel(entry.actor)}</span><p>{entry.text}</p>{entry.judgement && <BattleDice judgement={entry.judgement} />}</li>)}</ol>
      </details>
    </section>
  );
}

function actorLabel(actor: CombatLogEntry["actor"]) {
  return actor === "pc" ? "あなた" : actor === "zaira" ? "ザイラ" : "戦況";
}

function ResultEntry({ entry }: { entry: CombatLogEntry }) {
  const judgement = entry.judgement;
  return (
    <div className={`battle-result-entry battle-result-${entry.actor}`}>
      {judgement ? <>
        <h4>{entry.title ?? actorLabel(entry.actor)}</h4>
        <p className="battle-damage">{judgement.successes === 0 ? "攻撃は外れました" : `${entry.actor === "pc" ? "ザイラ" : "あなた"}に${judgement.appliedDamage ?? 0}ダメージ`}</p>
        <BattleDice judgement={judgement} />
      </> : <p>{entry.text}</p>}
    </div>
  );
}

function Gauge({ label, value, max, enemy = false }: { label: string; value: number; max: number; enemy?: boolean }) {
  return <div className={`battle-gauge ${enemy ? "battle-gauge-enemy" : ""}`}>
    <div><span>{enemy ? label : "あなたのZS"}</span><strong>{value}<small> / {max}</small></strong></div>
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="battle-gauge-track"><div style={{ width: `${value / max * 100}%` }} /></div>
  </div>;
}

function phaseLabel(state: CombatState) {
  switch (state.phase) {
    case "player-turn": return "あなたの攻撃 → 敵の反撃 → 次のラウンド";
    case "evade-prompt": return "あなたの攻撃は終了。次は敵の反撃です";
    case "enemy-ready": return "次は敵の攻撃のダイスを振ります";
    case "enemy-resolved": return `第${state.round}ラウンドの攻防が終わりました`;
    case "won": return "戦闘終了。ザイラを撃破しました";
    case "lost": return "戦闘終了。あなたの機体が停止しました";
  }
}

function shortPhase(state: CombatState) {
  switch (state.phase) {
    case "player-turn": return "攻撃を選ぶ";
    case "evade-prompt":
    case "enemy-ready": return "敵の反撃";
    case "enemy-resolved": return "結果確認";
    case "won": return "撃破";
    case "lost": return "機関停止";
  }
}

function attackHint(mode: AttackMode) {
  if (mode === "slash") return `ダイス${KUROAYA.burst}個。${KUROAYA.target}以下で成功。成功1個につき${KUROAYA.power}ダメージ`;
  if (mode === "double") return `両手で2回攻撃。各ダイス${KUROAYA.burst}個。${KUROAYA.target - DOUBLE_TRIGGER_PENALTY}以下で成功`;
  if (mode === "charge") return `今回は突入。次の手番に威力${CHARGE_ATTACK_MULTIPLIER}倍。突入中は回避できません`;
  return `ダイス${KUROAYA.burst}個。${KUROAYA.target}以下で成功。成功1個につき${KUROAYA.power * CHARGE_ATTACK_MULTIPLIER}ダメージ`;
}

function describeRoll(state: CombatState, pending: Pending) {
  if (pending.type === "enemy") {
    const target = Math.max(0, state.incoming.target - (pending.evade ? JIG_THRUST_CELLS : 0));
    return { title: `ザイラの${state.incoming.label}`, count: state.incoming.burst, description: `10面ダイス${state.incoming.burst}個。${target}以下で命中。${pending.evade ? `回避で目標値を${JIG_THRUST_CELLS}下げます。` : ""}受けるダメージから装甲の軽減${PC.damageReduction}を引きます。` };
  }
  const option = attackOptionsFor(state).find((item) => item.mode === pending.mode)!;
  const target = KUROAYA.target - (pending.mode === "double" ? DOUBLE_TRIGGER_PENALTY : 0);
  const power = KUROAYA.power * (pending.mode === "release" ? CHARGE_ATTACK_MULTIPLIER : 1);
  return { title: option.label, count: KUROAYA.burst * (pending.mode === "double" ? 2 : 1), description: pending.mode === "charge" ? "次の手番の一撃に備えて突入します。この行動ではダイスを振りません。" : `10面ダイス${KUROAYA.burst}個${pending.mode === "double" ? "を右手・左手で1回ずつ" : ""}。${target}以下で成功。成功1個につき${power}ダメージ。出目1は追加で振ります。` };
}
