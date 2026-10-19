import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BattleView } from "./BattleView";
import { createCombat, nextRound, playerAttack, resolveEnemyAttack } from "@/engine/combat";

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe("戦闘画面", () => {
  it("座標攻撃の範囲外を選ぶと経路を表示し、ダイスなしで移動を確定する", async () => {
    const random = vi.spyOn(Math, "random");
    const miss = () => 0.95;
    let state = nextRound(resolveEnemyAttack(playerAttack(createCombat(), "slash", miss), "stay", miss));
    state = playerAttack(state, "slash", miss);
    const user = userEvent.setup();
    render(<BattleView initialSave={{ version: 1, state, lostCount: 0, eventStart: 0 }} onEnd={() => {}} />);
    expect(screen.getByRole("img", { name: /攻撃範囲：中央、5in、5out、6in、6out、7in、7out/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /ジグスラストで11outへ回避/ }));
    expect(screen.getByRole("img", { name: /選んだ経路：中央、10in、10out、11out/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ダイスを振る" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "範囲外へ移動する" }));
    expect(random).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: /あなた：11out/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /次のラウンドへ/ })).toBeInTheDocument();
  });

  it("物語で選んだ文字サイズを引き継ぎ、地図をたたんでも位置と耐久値を確認できる", async () => {
    localStorage.setItem("avandner-trial-large-text", "true");
    const user = userEvent.setup();
    render(<BattleView onEnd={() => {}} />);
    expect(screen.getByRole("region", { name: "ザイラとの戦闘" })).toHaveAttribute("data-large-text", "true");
    await user.click(screen.getByRole("button", { name: "地図をたたむ" }));
    expect(screen.queryByRole("img", { name: /ダイアクロック/ })).not.toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "あなたのジアドスフィア" })).toHaveAttribute("aria-valuenow", "73");
    expect(screen.getByText("6out")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "地図を表示" }));
    expect(screen.getByRole("img", { name: /ダイアクロック/ })).toBeInTheDocument();
  });

  it("慣れた人向けの設定では、行動を選ぶだけで一度だけ振り、結果は残す", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.45);
    const user = userEvent.setup();
    render(<StrictMode><BattleView onEnd={() => {}} /></StrictMode>);
    await user.click(screen.getByText("遊び方と表示の設定"));
    await user.click(screen.getByRole("checkbox", { name: "行動を選ぶとすぐにダイスを振る" }));
    await user.click(screen.getByRole("button", { name: /黒絢で斬る/ }));
    await within(screen.getByRole("region", { name: "直前の結果" })).findByText("ザイラに72ダメージ");
    expect(random).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: /ジグスラストで7outへ回避/ }));
    await screen.findByText("第1ラウンドの攻防が終わりました");
    expect(random).toHaveBeenCalledTimes(8);
  });

  it("攻撃の選択とダイスを分け、StrictModeでも1回分だけ振る", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.45);
    const user = userEvent.setup();
    render(<StrictMode><BattleView onEnd={() => {}} /></StrictMode>);
    expect(screen.getByRole("img", { name: /ダイアクロックマップ。あなた：6out/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /黒絢で斬る/ }));
    expect(random).not.toHaveBeenCalled();
    expect(screen.getByRole("meter", { name: "ザイラの耐久値" })).toHaveAttribute("aria-valuenow", "140");
    await user.click(screen.getByRole("button", { name: "ダイスを振る" }));
    await screen.findByText("ザイラに72ダメージ");
    expect(random).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("meter", { name: "ザイラの耐久値" })).toHaveAttribute("aria-valuenow", "68");
    expect(screen.getByRole("img", { name: /あなた：中央/ })).toBeInTheDocument();
    const result = within(screen.getByRole("region", { name: "直前の結果" }));
    expect(result.getAllByRole("listitem")).toHaveLength(2);
    expect(result.getByText(/成功2個 × 威力36/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ジグスラストで7outへ回避/ }));
    expect(random).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "ダイスを振る" }));
    await screen.findByText("第1ラウンドの攻防が終わりました");
    expect(random).toHaveBeenCalledTimes(8);
    expect(screen.getByRole("img", { name: /あなた：7out/ })).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "あなたのジアドスフィア" })).toHaveAttribute("aria-valuenow", "70");
    expect(result.getAllByRole("listitem")).toHaveLength(6);
    await user.click(screen.getByRole("button", { name: "次のラウンドへ" }));
    expect(screen.getByText(/第2ラウンド/)).toBeInTheDocument();
  });

  it("ダブルトリガーは右手と左手それぞれの出目を表示する", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    const user = userEvent.setup();
    render(<BattleView onEnd={() => {}} />);
    await user.click(screen.getByRole("button", { name: /ダブルトリガー/ }));
    await user.click(screen.getByRole("button", { name: "ダイスを振る" }));
    const result = within(screen.getByRole("region", { name: "直前の結果" }));
    await result.findByRole("heading", { name: "右手の黒絢" });
    expect(result.getByRole("heading", { name: "左手の黒絢" })).toBeInTheDocument();
    expect(result.getAllByRole("listitem")).toHaveLength(4);
  });

  it("経路を選ぶと威力と地図の予告が変わり、同じ手番で攻撃する", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.45);
    const user = userEvent.setup();
    render(<BattleView onEnd={() => {}} />);
    await user.click(screen.getByRole("radio", { name: /超過移動で接近/ }));
    expect(screen.getByRole("img", { name: /選んだ経路：6out、7out、8out、9out、10out、10in、中央/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /黒絢で斬る/ }));
    await user.click(screen.getByRole("button", { name: "ダイスを振る" }));
    await within(screen.getByRole("region", { name: "直前の結果" })).findByText("ザイラに96ダメージ");
    expect(screen.getByRole("meter", { name: "あなたのジアドスフィア" })).toHaveAttribute("aria-valuenow", "70");
    expect(screen.getByRole("button", { name: /ジグスラストで11outへ回避/ })).toBeInTheDocument();
  });

  it("振るボタンを連続で押しても追加で振らない", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.45);
    const user = userEvent.setup();
    render(<BattleView onEnd={() => {}} />);
    await user.click(screen.getByRole("button", { name: /黒絢で斬る/ }));
    const button = screen.getByRole("button", { name: "ダイスを振る" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(random).toHaveBeenCalledTimes(2));
  });

  it("出目1は追加で振り、追加の成功と威力ボーナスも結果に含める", async () => {
    const random = vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.05).mockReturnValueOnce(0.95).mockReturnValueOnce(0.25);
    const user = userEvent.setup();
    render(<BattleView onEnd={() => {}} />);
    await user.click(screen.getByRole("button", { name: /黒絢で斬る/ }));
    await user.click(screen.getByRole("button", { name: "ダイスを振る" }));
    const result = within(screen.getByRole("region", { name: "直前の結果" }));
    await result.findByText("ザイラに82ダメージ");
    expect(random).toHaveBeenCalledTimes(3);
    expect(result.getAllByRole("listitem")).toHaveLength(3);
    expect(result.getByLabelText("出目1、クリティカル")).toBeInTheDocument();
    expect(result.getByLabelText("出目3、成功、振り足し1回目")).toBeInTheDocument();
    expect(result.getByText(/成功2個 × 威力36 ＋ 黒絢の追加ダメージ10/)).toBeInTheDocument();
  });

  it("攻撃を選び直してもダイスや位置を変えない", async () => {
    const random = vi.spyOn(Math, "random");
    const user = userEvent.setup();
    render(<BattleView onEnd={() => {}} />);
    await user.click(screen.getByRole("button", { name: /黒絢で斬る/ }));
    await user.click(screen.getByRole("button", { name: "選び直す" }));
    expect(random).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: /あなた：6out/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ダブルトリガー/ })).toBeInTheDocument();
  });
});

