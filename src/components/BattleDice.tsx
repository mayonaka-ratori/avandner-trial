import type { AttackJudgement } from "@/engine/judge";

export function TenSidedDie({ value, success, critical = false, rolling = false }: {
  value?: number; success?: boolean; critical?: boolean; rolling?: boolean;
}) {
  return (
    <svg viewBox="0 0 42 48" aria-hidden="true" className={`battle-die ${critical ? "battle-die-critical" : success ? "battle-die-success" : ""} ${rolling ? "battle-die-rolling" : ""}`}>
      <path d="M21 2 L39 15 L33 37 L21 46 L9 37 L3 15 Z" className="die-outline" />
      <path d="M21 2 L11 22 L21 46 L31 22 Z M3 15 L11 22 L9 37 M39 15 L31 22 L33 37" className="die-facets" />
      <text x="21" y="26">{rolling ? "?" : value ?? "?"}</text>
    </svg>
  );
}

export function BattleDice({ judgement: j }: { judgement: AttackJudgement }) {
  return (
    <div className="battle-dice-result">
      <p>10面ダイス{j.burst}個・<strong>{j.effectiveTarget}以下</strong>で成功{j.extraDice > 0 && `（振り足し${j.extraDice}個）`}</p>
      <ul className="battle-dice-list" aria-label="ダイスの出目">
        {j.dice.map((die, i) => (
          <li key={i} aria-label={`出目${die.value}、${die.isCritical ? "クリティカル" : die.isSuccess ? "成功" : "失敗"}${die.wave > 0 ? `、振り足し${die.wave}回目` : ""}`}>
            <TenSidedDie value={die.value} success={die.isSuccess} critical={die.isCritical} />
            <span>{die.isCritical ? "成功＋振り足し" : die.isSuccess ? "成功" : "失敗"}</span>
          </li>
        ))}
      </ul>
      <p className="battle-calculation">成功{j.successes}個 × 威力{j.power ?? 0}
        {j.criticalBonusDamage > 0 && ` ＋ 黒絢の追加ダメージ${j.criticalBonusDamage}`}
        {j.damageReduction > 0 && ` − 軽減${j.damageReduction}`}
        {` → ${j.appliedDamage ?? 0}ダメージ`}
      </p>
      {j.criticals > 0 && <p>出目1はクリティカル。成功として数え、ダイスを1個振り足します。{j.criticalTriggerBonus > 0 && `黒絢の効果で、出目1が1個につきダメージも${j.criticalTriggerBonus}増えます。`}</p>}
    </div>
  );
}
