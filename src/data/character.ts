/**
 * character.ts — 体験版で使う固定データ
 *
 * PC は本編サンプルキャラクター「軽量逆関節・白兵型」（本編 p.15）。
 * 数値は avandnar-app の src/game/data/sampleCharacters.ts（原典の写しから
 * 生成されたデータ）から、体験版で使う分だけを転記した。
 *
 * 敵のエグゾーストフォートレス「ザイラ」は本編シナリオ「装甲列車救援依頼」
 * （本編 p.88）のものを、1 人・5〜10 分の体験向けに耐久値とルーチンを縮小した。
 * 原作の耐久値は 1100・推奨 PL 数 4 人。
 */

/** PC の武器「黒絢」（実体ブレード・白兵） */
export const KUROAYA = {
  name: "黒絢",
  burst: 2,
  target: 5,
  power: 30,
  criticalTriggerBonus: 10,
} as const;

/** チャージアタックの威力倍率（【チャージアタック：×３】） */
export const CHARGE_ATTACK_MULTIPLIER = 3;
/** チャージアタックで使う超過移動のコスト（ZS から引く） */
export const CHARGE_ATTACK_COST = 3;

/** ダブルトリガーの目標値ペナルティ（−2） */
export const DOUBLE_TRIGGER_PENALTY = 2;

/** ジグスラストの回避セル数（＝敵の目標値へのペナルティ）とコスト */
export const JIG_THRUST_CELLS = 3;
export const JIG_THRUST_COST = 3;

/** PC のジアドスフィア（耐久力）とダメージ軽減 */
export const PC = {
  name: "PC1（新人アヴァンドナー）",
  model: "軽量逆関節・白兵型",
  zsMax: 73,
  damageReduction: 4, // チェスト RELIA026-C【ダメージ軽減：３】＋マニューバ Sequana044/M【ダメージ軽減：１】
} as const;

/** 試遊用に縮小したザイラ */
export const ZAIRA = {
  name: "ザイラ",
  hp: 180,
  flavor: "全高80メートル、全長300メートルに及ぶ直方体のエグゾーストフォートレス",
} as const;

/** ザイラの攻撃パターン。ラウンドごとに順番に使い、最後まで行ったら 2 番目以降を繰り返す */
export interface ZairaAttack {
  id: string;
  label: string;
  /** 攻撃の演出文 */
  flavor: string;
  burst: number;
  target: number;
  power: number;
  /** 座標攻撃はジグスラストで回避できない（ペナルティを受けない） */
  coordinateAttack: boolean;
}

export const ZAIRA_ATTACKS: ZairaAttack[] = [
  {
    id: "sub-cannon",
    label: "副砲",
    flavor: "装甲が開き、副砲が放たれる。",
    burst: 6,
    target: 6,
    power: 8,
    coordinateAttack: false,
  },
  {
    id: "machine-gun",
    label: "機銃掃射",
    flavor: "EF本体から機銃の掃射。面を制圧する弾幕はジグスラストでは避けられない。",
    burst: 7,
    target: 7,
    power: 6,
    coordinateAttack: true,
  },
  {
    id: "main-cannon",
    label: "主砲",
    flavor: "装甲が大きく展開し、主砲が露出。強力な一撃が放たれる。",
    burst: 8,
    target: 7,
    power: 10,
    coordinateAttack: false,
  },
];

/** ラウンド番号からこのラウンドの攻撃を返す */
export function zairaAttackFor(round: number): ZairaAttack {
  if (round <= 1) return ZAIRA_ATTACKS[0];
  // ラウンド2以降は 機銃→主砲→機銃→主砲…
  return ZAIRA_ATTACKS[1 + ((round - 2) % 2)];
}
