import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BattleView } from "./BattleView";

afterEach(() => vi.restoreAllMocks());

describe("戦闘画面", () => {
  it("攻撃の選択とダイスを分け、StrictModeでも1回分だけ振る", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.45);
    const user = userEvent.setup();
    render(<StrictMode><BattleView onEnd={() => {}} /></StrictMode>);
    expect(screen.getByRole("img", { name: /ダイアクロックマップ。あなた：6out/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /黒絢で斬る/ }));
    expect(random).not.toHaveBeenCalled();
    expect(screen.getByRole("meter", { name: "ザイラの耐久値" })).toHaveAttribute("aria-valuenow", "140");
    await user.click(screen.getByRole("button", { name: "ダイスを振る" }));
    await screen.findByText("ザイラに60ダメージ");
    expect(random).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("meter", { name: "ザイラの耐久値" })).toHaveAttribute("aria-valuenow", "80");
    expect(screen.getByRole("img", { name: /あなた：中央/ })).toBeInTheDocument();
    const result = within(screen.getByRole("region", { name: "直前の結果" }));
    expect(result.getAllByRole("listitem")).toHaveLength(2);
    expect(result.getByText(/成功2個 × 威力30/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ジグスラストで回避する/ }));
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

  it("突入と敵のダイスを分け、回避できない理由を表示する", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.95);
    const user = userEvent.setup();
    render(<BattleView onEnd={() => {}} />);
    await user.click(screen.getByRole("button", { name: /チャージアタック/ }));
    await user.click(screen.getByRole("button", { name: "突入する" }));
    expect(random).not.toHaveBeenCalled();
    expect(screen.getByText("突入中のため回避できません。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ダイスを振る" }));
    await screen.findByText("第1ラウンドの攻防が終わりました");
    expect(random).toHaveBeenCalledTimes(6);
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
    await result.findByText("ザイラに70ダメージ");
    expect(random).toHaveBeenCalledTimes(3);
    expect(result.getAllByRole("listitem")).toHaveLength(3);
    expect(result.getByLabelText("出目1、クリティカル")).toBeInTheDocument();
    expect(result.getByLabelText("出目3、成功、振り足し1回目")).toBeInTheDocument();
    expect(result.getByText(/成功2個 × 威力30 ＋ 追加10/)).toBeInTheDocument();
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

