/**
 * narrate.test.ts — 中継 API の分岐テスト
 *
 * OpenAI への fetch はスタブする。検証するのはこちら側の振る舞い:
 * CORS・場面キーの検証・キルスイッチ・上流失敗時の 502・レート制限。
 * 429 のテストはインスタンス内カウンタを使い切るので、このファイルの
 * 最後に置く（同一ウィンドウ内の他テストの呼び出し数に注意）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/narrate";

const URL = "https://avandner-trial.vercel.app/api/narrate";
const GOOD_ORIGIN = "https://mayonaka-ratori.github.io";

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: GOOD_ORIGIN,
      "x-forwarded-for": "198.51.100.1",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function openAiOk(text = "語りのテスト文") {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: text } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

beforeEach(() => {
  vi.stubEnv("TRIAL_ENABLED", "true");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  // Response は一度しか読めないので、呼び出しごとに新しいものを返す
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => Promise.resolve(openAiOk())),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("api/narrate", () => {
  it("OPTIONS はプリフライトとして 204 を返す", async () => {
    const res = await handler(
      new Request(URL, { method: "OPTIONS", headers: { origin: GOOD_ORIGIN } }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(GOOD_ORIGIN);
  });

  it("POST 以外は 405", async () => {
    const res = await handler(new Request(URL, { method: "GET" }));
    expect(res.status).toBe(405);
  });

  it("許可されていない Origin には allow-origin を付けない", async () => {
    const res = await handler(
      req({ scene: "awakening" }, { origin: "https://evil.example.com" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("TRIAL_ENABLED=false なら 403（キルスイッチ）", async () => {
    vi.stubEnv("TRIAL_ENABLED", "false");
    const res = await handler(req({ scene: "awakening" }));
    expect(res.status).toBe(403);
  });

  it("知らない場面キーは 400", async () => {
    const res = await handler(req({ scene: "admin-panel" }));
    expect(res.status).toBe(400);
  });

  it("OPENAI_API_KEY が無ければ 503", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const res = await handler(req({ scene: "awakening" }));
    expect(res.status).toBe(503);
  });

  it("上流が成功すれば text を返し、自由入力がプロンプトに渡る", async () => {
    const res = await handler(
      req({ scene: "reply-awakening", freeInput: "おはよう" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "語りのテスト文" });

    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[2].content).toContain("おはよう");
  });

  it("上流が 5xx なら 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response("boom", { status: 500 })),
        ),
    );
    const res = await handler(req({ scene: "awakening" }));
    expect(res.status).toBe(502);
  });

  it("上流が空文を返したら 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() => Promise.resolve(openAiOk("   "))),
    );
    const res = await handler(req({ scene: "awakening" }));
    expect(res.status).toBe(502);
  });

  it("同一 IP からの連打は 429 で止まる", async () => {
    const headers = { "x-forwarded-for": "203.0.113.99" };
    for (let i = 0; i < 30; i++) {
      const res = await handler(req({ scene: "awakening" }, headers));
      expect(res.status).toBe(200);
    }
    const res = await handler(req({ scene: "awakening" }, headers));
    expect(res.status).toBe(429);
  });

  it("先頭の IP を偽装しても末尾が同じなら同じバケットで数える", async () => {
    // 実クライアント IP は x-forwarded-for の末尾。先頭を毎回変えても
    // 末尾が "203.0.113.100" なら同一 IP のバケットに入る
    for (let i = 0; i < 30; i++) {
      const res = await handler(
        req(
          { scene: "awakening" },
          { "x-forwarded-for": `10.0.0.${i}, 203.0.113.100` },
        ),
      );
      expect(res.status).toBe(200);
    }
    // 31回目：先頭だけ変えた偽装でも末尾が同じなら 429
    const res = await handler(
      req(
        { scene: "awakening" },
        { "x-forwarded-for": "9.9.9.9, 203.0.113.100" },
      ),
    );
    expect(res.status).toBe(429);

    // 末尾が違う IP は別バケットなので 200 が返る
    const other = await handler(
      req({ scene: "awakening" }, { "x-forwarded-for": "203.0.113.101" }),
    );
    expect(other.status).toBe(200);
  });
});
