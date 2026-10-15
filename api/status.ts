/**
 * api/status.ts — 体験版が利用可能かを返すだけの軽いエンドポイント
 *
 * イベント終了後は Vercel の環境変数 TRIAL_ENABLED を "false" にする
 * （またはデプロイを消す）。画面は enabled !== true を「終了」と解釈する。
 */

export const config = { runtime: "edge" };

const ALLOWED_ORIGINS = [
  "https://mayonaka-ratori.github.io",
  "http://localhost:5176",
  "http://localhost:4173",
];

export default function handler(request: Request): Response {
  const origin = request.headers.get("origin") ?? "";
  const headers = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const enabled = process.env.TRIAL_ENABLED !== "false";
  return Response.json({ enabled }, { headers });
}

function corsHeaders(origin: string): HeadersInit {
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}
