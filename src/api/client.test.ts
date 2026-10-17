import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("公開時の通信設定", () => {
  it("予備文章で公開するときはサーバーを待たない", async () => {
    vi.stubEnv("VITE_TRIAL_MODE", "static");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const client = await import("./client");
    expect(await client.checkStatus()).toBe("error");
    expect(await client.narrate("awakening")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("指定したサーバーから利用状態と文章を受け取る", async () => {
    vi.stubEnv("VITE_TRIAL_MODE", "online");
    vi.stubEnv("VITE_API_BASE", "https://trial.example.com");
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ enabled: true }))
      .mockResolvedValueOnce(Response.json({ text: "おはよう。" }));
    vi.stubGlobal("fetch", fetch);
    const client = await import("./client");
    expect(await client.checkStatus()).toBe("ok");
    expect(await client.narrate("awakening")).toBe("おはよう。");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://trial.example.com/api/status",
      "https://trial.example.com/api/narrate",
    ]);
  });

  it("同じ公開先の API も指定でき、終了設定を受け取る", async () => {
    vi.stubEnv("VITE_TRIAL_MODE", "online");
    vi.stubEnv("VITE_API_BASE", "");
    const fetch = vi.fn().mockResolvedValue(Response.json({ enabled: false }));
    vi.stubGlobal("fetch", fetch);
    const client = await import("./client");
    expect(await client.checkStatus()).toBe("closed");
    expect(fetch.mock.calls[0][0]).toBe("/api/status");
  });

  it("VercelではURLを指定しなくても同じ公開先に問い合わせる", async () => {
    vi.stubEnv("VITE_TRIAL_MODE", "online");
    vi.stubEnv("VITE_API_BASE", undefined);
    vi.stubEnv("BASE_URL", "/");
    const fetch = vi.fn().mockResolvedValue(Response.json({ enabled: true }));
    vi.stubGlobal("fetch", fetch);
    const client = await import("./client");
    expect(await client.checkStatus()).toBe("ok");
    expect(fetch.mock.calls[0][0]).toBe("/api/status");
  });
});
