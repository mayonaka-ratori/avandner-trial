import { StrictMode } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

const SAVE_KEY = "avandnar-trial-save";
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  sessionStorage.setItem(SAVE_KEY, JSON.stringify({ sceneId: "insertion", choiceLog: [], battleResult: "won", startedAt: 100 }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("戦闘途中からの再開", () => {
  it("再読み込み後も残りZS・位置・出目・直前の結果を戻し、敵の攻撃を振り直さない", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.45);
    const user = userEvent.setup();
    const first = render(<StrictMode><App /></StrictMode>);
    await user.click(await screen.findByRole("button", { name: "途中から再開する" }));
    await user.click(await screen.findByRole("button", { name: "ザイラに交戦する" }));
    await user.click(screen.getByRole("button", { name: /黒絢で斬る/ }));
    await user.click(screen.getByRole("button", { name: "ダイスを振る" }));
    await user.click(await screen.findByRole("button", { name: /ジグスラストで7outへ回避/ }));
    await user.click(screen.getByRole("button", { name: "ダイスを振る" }));
    await screen.findByRole("button", { name: /次のラウンドへ/ });
    const saved = JSON.parse(sessionStorage.getItem(SAVE_KEY)!);
    expect(saved.battle.state.pcZs).toBe(70);
    expect(saved.battle.state.pcCell).toEqual({ ring: "out", hour: 7 });
    expect(random).toHaveBeenCalledTimes(8);
    first.unmount();

    render(<StrictMode><App /></StrictMode>);
    await user.click(await screen.findByRole("button", { name: "途中から再開する" }));
    expect(screen.queryByRole("button", { name: "ザイラに交戦する" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "超高速突入" })).not.toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "あなたのジアドスフィア" })).toHaveAttribute("aria-valuenow", "70");
    expect(screen.getByRole("img", { name: /あなた：7out/ })).toBeInTheDocument();
    const result = within(screen.getByRole("region", { name: "直前の結果" }));
    expect(result.getByText("ZS 73 → 70（回避の消費3＋被弾0）。")).toBeInTheDocument();
    expect(result.getAllByRole("listitem")).toHaveLength(6);
    expect(random).toHaveBeenCalledTimes(8);
    expect(JSON.parse(sessionStorage.getItem(SAVE_KEY)!)).toEqual(saved);
    await user.click(screen.getByRole("button", { name: /次のラウンドへ/ }));
    expect(JSON.parse(sessionStorage.getItem(SAVE_KEY)!).battle.state.round).toBe(2);
  });

  it("古い保存と壊れた戦闘の保存では、物語の続きから遊べる", async () => {
    const saved = JSON.parse(sessionStorage.getItem(SAVE_KEY)!);
    sessionStorage.setItem(SAVE_KEY, JSON.stringify({ ...saved, battle: { version: 1, state: { phase: "evade-prompt" } } }));
    render(<App />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "途中から再開する" }));
    expect(await screen.findByRole("button", { name: "ザイラに交戦する" })).toBeInTheDocument();
  });
});
