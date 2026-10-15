/**
 * シーンの型定義
 *
 * シナリオは SceneDef の列として定義する。進行は next でつなぐ一本道で、
 * 分岐は「選択肢ごとの短い応答文」だけ（行き先は同じ）。
 * fallback は API が使えないときにそのまま表示する書き下ろし文章で、
 * これだけで最後まで遊べることが必須。
 */

export interface ChoiceOption {
  /** 選択肢の識別子。同一シーン内で一意。endingExtras などの判定に使う */
  id: string;
  /** ボタンの表示 */
  label: string;
  /** 選んだあとに差し込む応答文（段落の配列） */
  response: string[];
}

/** プレイヤーの選択・発言の記録。endingExtras の判定とエンディング API への素材に使う */
export interface ChoiceRecord {
  /** どのシーンでの記録か */
  sceneId: string;
  /** choice の場合は選択肢の id。free 入力では undefined */
  optionId?: string;
  /** 人が読める記録（選択肢ラベル or 入力文）。エンディング API の素材 */
  label: string;
}

export type Interaction =
  | { type: "continue" }
  | { type: "choice"; options: ChoiceOption[] }
  | { type: "free"; prompt: string; placeholder: string; replyFallback: string[] }
  | { type: "combat" }
  | { type: "ending" };

export interface SceneDef {
  id: string;
  /** 画面上部のシステムラベル（"// MISSION ALERT" など） */
  kicker?: string;
  /**
   * 本文の前に出す警告帯のラベル（"INCOMING TRANSMISSION" など）。
   * 銅色の枠で点滅表示される。
   */
  alert?: string;
  title: string;
  /**
   * LLM に語りを生成させるときの場面キー（api/narrate.ts の PROMPTS と対応）。
   * 省略した場面は常に fallback を表示する。
   */
  narrationKey?: string;
  /** API が使えない・失敗したときに表示する本文（段落の配列） */
  fallback: string[];
  interaction: Interaction;
  /** interaction 解決後の行き先。combat / ending では不要 */
  next?: string;
}
