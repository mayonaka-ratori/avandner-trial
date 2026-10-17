/**
 * api/client.ts — Vercel 上の中継 API との通信
 *
 * 失敗・タイムアウト・無効化のときは null を返す。呼び出し側は
 * null のとき予備文章（fallback）に切り替えるので、このモジュールは
 * 絶対に throw しない設計にしてある。
 */

/** 中継 API のベース URL。ビルド時に差し替え可能 */
const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  (import.meta.env.BASE_URL === "/" ? "" : "https://avandner-trial.vercel.app");

// 文章を生成するサーバーを使わない公開では、通信を待たず予備文章で進める。
const STATIC_MODE = import.meta.env.VITE_TRIAL_MODE === "static";

// 会場の不安定な回線で長く待たせない。切れても fallback 文章に切り替わるので早めに諦める
const TIMEOUT_MS = 8_000;

export type TrialStatus = "ok" | "closed" | "error";

/** 体験版が利用可能かを確認する。error はネットワーク不通など判別不能な場合 */
export async function checkStatus(): Promise<TrialStatus> {
  if (STATIC_MODE) return "error";
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/status`, {
      method: "GET",
    });
    if (!res.ok) return "error";
    const data = (await res.json()) as { enabled?: boolean };
    return data.enabled === true ? "ok" : "closed";
  } catch {
    return "error";
  }
}

export interface NarrateOptions {
  /** 自由入力の本文（free シーン用） */
  freeInput?: string;
  /** エンディングの総括用に、プレイヤーが選んだ選択肢の一覧 */
  choices?: string[];
  /** エンディングの総括用に、戦闘の結果 */
  battleResult?: "won" | "lost-then-won";
}

/**
 * 場面の語りを生成してもらう。失敗したら null（＝予備文章に切り替え）
 */
export async function narrate(
  sceneKey: string,
  options: NarrateOptions = {},
): Promise<string | null> {
  if (STATIC_MODE) return null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/narrate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scene: sceneKey, ...options }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: unknown };
    return typeof data.text === "string" && data.text.length > 0
      ? data.text
      : null;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
