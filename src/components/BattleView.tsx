import { useEffect, useRef, useState } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import { attackOptionsFor, attackPower, createCombat, nextRound, playerAttack, resolveEnemyAttack, type AttackMode, type CombatLogEntry, type CombatState } from "@/engine/combat";
import type { BattleSave } from "@/engine/battleSave";
import { DOUBLE_TRIGGER_PENALTY, JIG_THRUST_COST, KUROAYA, PC, ZAIRA } from "@/data/character";
import { attackRoutes, cellLabel, evadeRoutes, inAttackArea, type MoveRoute } from "@/engine/position";
import { TEXT_SIZE_KEY, useStoredBoolean } from "@/hooks/useStoredBoolean";
import { BattleMap } from "./BattleMap";
import { BattleDice, TenSidedDie } from "./BattleDice";

type Pending = { type: "attack"; mode: AttackMode; routeId: string } | { type: "enemy"; defense: string };
const ROLL_MS = import.meta.env.MODE === "test" ? 0 : 700;

export function BattleView({ onEnd, initialSave, onSave }: {
  onEnd: (result: "won" | "lost-then-won") => void;
  initialSave?: BattleSave;
  onSave?: (save: BattleSave) => void;
}) {
  const [snapshot, setSnapshot] = useState<BattleSave>(() => initialSave ?? { version: 1, state: createCombat(), lostCount: 0, eventStart: 0 });
  const { state, lostCount, eventStart } = snapshot;
  const [pending, setPending] = useState<Pending | null>(null);
  const [routeId, setRouteId] = useState("direct");
  const [rolling, setRolling] = useState(false);
  const [largeText, toggleLargeText] = useStoredBoolean(TEXT_SIZE_KEY);
  const [compactMap, toggleMap] = useStoredBoolean("avandner-trial-compact-map");
  const [quickRoll, toggleQuickRoll] = useStoredBoolean("avandner-trial-quick-roll");
  const rollLock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const resultRef = useRef<HTMLElement>(null);
  const controlsRef = useRef<HTMLElement>(null);
  const rollButtonRef = useRef<HTMLButtonElement>(null);
  const overviewRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLElement>(null);
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
  useEffect(() => {
    const overview = overviewRef.current;
    if (!overview || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      screenRef.current?.style.setProperty("--overview-height", `${overview.getBoundingClientRect().height}px`);
    });
    observer.observe(overview);
    return () => observer.disconnect();
  }, []);

  function commit(next: CombatState, start = eventStart, losses = lostCount) {
    const save: BattleSave = { version: 1, state: next, lostCount: losses, eventStart: start };
    setSnapshot(save);
    onSave?.(save);
    setPending(null);
    setRouteId("direct");
  }
  function apply(action: Pending) {
    // 乱数はReactの更新関数の外で、一度だけ使う。
    const next = action.type === "attack"
      ? playerAttack(state, action.mode, undefined, action.routeId)
      : resolveEnemyAttack(state, action.defense);
    commit(next, state.log.length);
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
  function choose(action: Pending) {
    if (rollLock.current) return;
    setPending(action);
    if (quickRoll) {
      if (escapes(state, action)) apply(action);
      else roll(action);
    }
  }

  const routes = attackRoutes(state.pcCell);
  const route = routes.find((route) => route.id === routeId) ?? routes[0];
  const defenseRoutes = evadeRoutes(state.approachHour);
  const selectedDefense = pending?.type === "enemy" ? defenseRoutes.find((route) => route.id === pending.defense) : undefined;
  const preview = pending?.type === "enemy" ? selectedDefense?.path : state.phase === "player-turn" ? route.path : undefined;
  const latest = state.log.slice(eventStart);
  const rollInfo = pending ? describeRoll(state, pending) : null;

  return (
    <section ref={screenRef} className="battle-screen" data-large-text={largeText} aria-label="ザイラとの戦闘">
      <div className="battle-toolbar">
        <h2 className="battle-title">ザイラとの戦闘</h2>
        <button className="reading-size-button" aria-pressed={largeText} onClick={toggleLargeText}>文字を大きく</button>
      </div>
      <div ref={overviewRef} className={`battle-overview ${compactMap ? "battle-overview-compact" : ""}`}>
        {!compactMap && <BattleMap state={state} previewPath={preview} />}
        <div className="battle-readout">
          <p className="battle-round">第{state.round}ラウンド<span className="battle-phase">{shortPhase(state)}</span></p>
          <Gauge label="ザイラの耐久値" value={state.zairaHp} max={ZAIRA.hp} enemy />
          <Gauge label="あなたのジアドスフィア" value={state.pcZs} max={PC.zsMax} />
          <p className="battle-position">現在地：<strong>{cellLabel(state.pcCell)}</strong></p>
          <button className="battle-map-toggle" aria-expanded={!compactMap} onClick={toggleMap}>{compactMap ? "地図を表示" : "地図をたたむ"}</button>
        </div>
      </div>
      <p className="battle-step" role="status" aria-live="polite">{rolling ? "10面ダイスを振っています…" : phaseLabel(state)}</p>
      <section ref={resultRef} tabIndex={-1} className="battle-latest" aria-label="直前の結果">
        <h3>{state.log.length === 1 ? "戦闘の目的" : "直前の結果"}</h3>
        {latest.map((entry, i) => <ResultEntry key={`${eventStart}-${i}`} entry={entry} />)}
      </section>
      <section ref={controlsRef} className="battle-controls" aria-label="次の行動">
        <fieldset disabled={rolling}>
          {!pending && state.phase === "player-turn" && <>
            <h3>移動と攻撃を選んでください</h3>
            <p className="battle-hint">敵の次の攻撃：<strong>{state.incoming.label}</strong>{state.incoming.coordinateAttack && "。斜線のセルを狙います"}</p>
            {routes.length > 1 && <fieldset className="battle-route-list">
              <legend>接近する経路</legend>
              {routes.map((item) => <label key={item.id} className="battle-route">
                <input type="radio" name="approach-route" value={item.id} checked={route.id === item.id} disabled={state.pcZs <= item.cost} onChange={() => setRouteId(item.id)} />
                <span><strong>{item.label}</strong><span>{item.path.length - 1}セル ／ 威力{attackPower(state, item.id)} ／ ZS消費{item.cost}</span></span>
              </label>)}
            </fieldset>}
            <p className="battle-hint">{route.path.length > 1
              ? `チャージアタック：威力30＋移動${route.path.length - 1}セル×3＝${attackPower(state, route.id)}。この手番に攻撃します。`
              : "移動しないため、黒絢の威力は30です。"}</p>
            <div className="battle-action-list">
              {attackOptionsFor().map((option) => <button key={option.mode} onClick={() => choose({ type: "attack", mode: option.mode, routeId: route.id })} className="battle-action">
                <span className="battle-action-name">{option.label}</span>
                <span>{option.mode === "slash" ? "1回攻撃。ダイス2個、5以下で成功。" : "両手で2回攻撃。それぞれダイス2個、3以下で成功。当たりにくい代わりに攻撃回数が増えます。"}</span>
                <span>成功1個につき{attackPower(state, route.id)}ダメージ</span>
              </button>)}
            </div>
          </>}
          {!pending && state.phase === "evade-prompt" && <>
            <h3>ザイラが{state.incoming.label}で反撃します</h3>
            <p className="battle-hint">{state.incoming.coordinateAttack
              ? "座標攻撃です。斜線のセルの外へ出れば、ダイスを振らずに避けられます。範囲内に残ると、移動しても当たりやすさは変わりません。"
              : "回避するとZSを3消費し、敵の成功する出目を3下げます。回避先を選んでください。"}</p>
            <div className="battle-action-list">
              {defenseRoutes.map((item) => {
                const safe = state.incoming.coordinateAttack && !inAttackArea(item.path[item.path.length - 1], state.incomingCells);
                return <button key={item.id} className="battle-action" disabled={state.pcZs <= JIG_THRUST_COST} onClick={() => choose({ type: "enemy", defense: item.id })}>
                  <span className="battle-action-name">ジグスラストで{item.label}</span>
                  <span>{state.pcZs <= JIG_THRUST_COST ? "ZSが足りません" : `ZS消費3。${state.incoming.coordinateAttack ? safe ? "攻撃範囲の外へ出ます" : "攻撃範囲内に残ります" : `敵は${Math.max(0, state.incoming.target - 3)}以下で命中`}`}</span>
                  <span className="battle-route-path">{item.path.map(cellLabel).join(" → ")}</span>
                </button>;
              })}
              <button className="battle-action" onClick={() => choose({ type: "enemy", defense: "stay" })}>
                <span className="battle-action-name">そのまま受ける</span>
                <span>回避の消費なし。敵は{state.incoming.target}以下で命中します</span>
              </button>
            </div>
          </>}
          {pending && rollInfo && <div className="battle-roll-panel" aria-busy={rolling}>
            <h3>{rollInfo.title}</h3><p><Sentences text={rollInfo.description} /></p>
            {escapes(state, pending) ? <button ref={rollButtonRef} className="battle-primary" onClick={() => apply(pending)}>範囲外へ移動する<ChevronRight size={16} /></button> : <>
              <div className="battle-rolling-dice" aria-hidden="true">{Array.from({ length: Math.min(rollInfo.count, 8) }, (_, i) => <TenSidedDie key={i} rolling={rolling} />)}</div>
              <button ref={rollButtonRef} className="battle-primary" onClick={() => roll(pending)}>{rolling ? "ダイスを振っています…" : "ダイスを振る"}</button>
            </>}
            <button className="battle-reselect" onClick={() => setPending(null)}>選び直す</button>
          </div>}
          {state.phase === "enemy-resolved" && <button className="battle-primary" onClick={() => commit(nextRound(state))}>次のラウンドへ<ChevronRight size={16} /></button>}
          {state.phase === "won" && <>
            <h3>ザイラを撃破しました</h3><p>装甲列車を守りました。</p>
            <button className="battle-primary" onClick={() => onEnd(lostCount > 0 ? "lost-then-won" : "won")}>エンディングへ<ChevronRight size={16} /></button>
          </>}
          {state.phase === "lost" && <>
            <h3>機関停止。姉貴分があなたを救出しました</h3>
            <p>もう一度挑戦できます。回避先と敵の攻撃範囲を確認してみてください。</p>
            <button className="battle-primary" onClick={() => { commit(createCombat(), 0, lostCount + 1); window.scrollTo({ top: 0 }); }}><RotateCcw size={16} />もう一度挑戦する</button>
          </>}
        </fieldset>
      </section>
      <details className="battle-help">
        <summary>遊び方と表示の設定</summary>
        <p>ZSはジアドスフィアの残りです。攻撃を受けたときや、超過移動・回避を使ったときに減ります。</p>
        <p>地図のinは内周、outは外周を表します。点線は選んだ経路です。現在地は、行動を確定すると変わります。</p>
        <p>黒絢のチャージアタックは、同じ手番の移動セル数×3を威力に加えます。両手で攻撃するときも、それぞれに加わります。</p>
        <p>体験版は、あなたの攻撃と敵の反撃を1回ずつ行います。原作のカウント進行、ラウンド開始時のZS回復、敵のクリティカルは省略しています。ザイラの耐久値と機銃の範囲は体験版用です。</p>
        <label className="battle-quick-roll"><input type="checkbox" checked={quickRoll} onChange={toggleQuickRoll} />行動を選ぶとすぐにダイスを振る</label>
        <p>慣れた人向けの設定です。出目と計算は毎回表示します。</p>
      </details>
      <details className="battle-history">
        <summary>これまでの戦闘記録（{state.log.length}件）</summary>
        <ol>{state.log.map((entry, i) => <li key={i}><span>第{entry.round}ラウンド・{actorLabel(entry.actor)}</span><p><Sentences text={entry.text} /></p>{entry.detail && <p className="battle-route-path">{entry.detail}</p>}{entry.judgement && <BattleDice judgement={entry.judgement} />}</li>)}</ol>
      </details>
    </section>
  );
}

function escapes(state: CombatState, pending: Pending): boolean {
  if (pending.type !== "enemy" || !state.incoming.coordinateAttack) return false;
  const route = evadeRoutes(state.approachHour).find((route) => route.id === pending.defense);
  return !!route && !inAttackArea(route.path[route.path.length - 1], state.incomingCells);
}
function actorLabel(actor: CombatLogEntry["actor"]) { return actor === "pc" ? "あなた" : actor === "zaira" ? "ザイラ" : "戦況"; }
function ResultEntry({ entry }: { entry: CombatLogEntry }) {
  const j = entry.judgement;
  return <div className={`battle-result-entry battle-result-${entry.actor}`}>{j ? <>
    <h4>{entry.title ?? actorLabel(entry.actor)}</h4>
    <p className="battle-damage">{j.successes === 0 ? "攻撃は外れました" : `${entry.actor === "pc" ? "ザイラ" : "あなた"}に${j.appliedDamage ?? 0}ダメージ`}</p>
    <BattleDice judgement={j} />
  </> : <p><Sentences text={entry.text} /></p>}</div>;
}
function Sentences({ text }: { text: string }) {
  return <>{text.split(/(?<=。)/u).filter(Boolean).map((sentence, i) => <span className="battle-sentence" key={i}>{sentence}</span>)}</>;
}
function Gauge({ label, value, max, enemy = false }: { label: string; value: number; max: number; enemy?: boolean }) {
  return <div className={`battle-gauge ${enemy ? "battle-gauge-enemy" : ""}`}>
    <div><span>{enemy ? "敵の耐久値" : "あなたのZS"}</span><strong>{value}<small> / {max}</small></strong></div>
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="battle-gauge-track"><div style={{ width: `${value / max * 100}%` }} /></div>
  </div>;
}
function phaseLabel(state: CombatState) {
  switch (state.phase) {
    case "player-turn": return "あなたの攻撃 → 敵の反撃 → 次のラウンド";
    case "evade-prompt": return "あなたの攻撃は終了。次は敵の反撃です";
    case "enemy-resolved": return `第${state.round}ラウンドの攻防が終わりました`;
    case "won": return "戦闘終了。ザイラを撃破しました";
    case "lost": return "戦闘終了。あなたの機体が停止しました";
  }
}
function shortPhase(state: CombatState) {
  switch (state.phase) {
    case "player-turn": return "移動・攻撃";
    case "evade-prompt": return "敵の反撃";
    case "enemy-resolved": return "結果確認";
    case "won": return "撃破";
    case "lost": return "機関停止";
  }
}
function pathDescription(route?: MoveRoute) {
  return route && route.path.length > 1 ? `${route.path.length - 1}セル移動して${cellLabel(route.path[route.path.length - 1])}へ。ZS消費${route.cost}。` : "移動のZS消費なし。";
}
function describeRoll(state: CombatState, pending: Pending) {
  if (pending.type === "enemy") {
    const route = evadeRoutes(state.approachHour).find((route) => route.id === pending.defense);
    const target = Math.max(0, state.incoming.target - (route && !state.incoming.coordinateAttack ? 3 : 0));
    return { title: `ザイラの${state.incoming.label}`, count: state.incoming.burst, description: pathDescription(route) + (escapes(state, pending)
      ? "攻撃範囲の外なので、敵のダイスは振りません。"
      : `10面ダイス${state.incoming.burst}個。${target}以下で命中。${route && state.incoming.coordinateAttack ? "範囲内に残るため、目標値は下がりません。" : ""}被弾ダメージから装甲の軽減${PC.damageReduction}を引きます。`) };
  }
  const route = attackRoutes(state.pcCell).find((item) => item.id === pending.routeId);
  const target = KUROAYA.target - (pending.mode === "double" ? DOUBLE_TRIGGER_PENALTY : 0);
  return { title: pending.mode === "slash" ? "黒絢で斬る" : "ダブルトリガー", count: KUROAYA.burst * (pending.mode === "double" ? 2 : 1), description: `${pathDescription(route)}10面ダイス2個${pending.mode === "double" ? "を右手・左手で1回ずつ" : ""}。${target}以下で成功。成功1個につき${attackPower(state, pending.routeId)}ダメージ。` };
}
