/**
 * 起動シーケンスとタイプライター表示のテスト
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BootSequence } from "./BootSequence";
import { Narration } from "./Narration";

afterEach(() => {
  vi.useRealTimers();
});

describe("BootSequence", () => {
  it("タップでスキップして onDone が呼ばれる", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<BootSequence onDone={onDone} />);
    await user.click(
      screen.getByRole("button", { name: /起動シーケンス/ }),
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("タイマーが進むと行が順に出て最後に onDone が呼ばれる", async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<BootSequence onDone={onDone} />);
    // 行表示→effect→次のタイマー登録、の連鎖なので
    // 1 ステップずつ act で区切ってフラッシュさせる
    for (let i = 0; i < 12; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("Narration（タイプライター）", () => {
  it("instant なら全文が即表示され onRevealed が呼ばれる", () => {
    const onRevealed = vi.fn();
    render(
      <Narration
        paragraphs={["第一段の文章です。", "第二段の文章です。"]}
        instant
        onRevealed={onRevealed}
      />,
    );
    expect(screen.getByText("第一段の文章です。")).toBeInTheDocument();
    expect(screen.getByText("第二段の文章です。")).toBeInTheDocument();
    expect(onRevealed).toHaveBeenCalledTimes(1);
  });

  it("タップで全文表示（スキップ）になる", async () => {
    const onRevealed = vi.fn();
    const user = userEvent.setup();
    render(
      <Narration
        paragraphs={["あいうえおかきくけこ"]}
        onRevealed={onRevealed}
      />,
    );
    // まだ全文は出ていないはず（タイマー未経過）
    await user.click(
      screen.getByRole("button", { name: "全文を表示する" }),
    );
    expect(screen.getByText("あいうえおかきくけこ")).toBeInTheDocument();
    expect(onRevealed).toHaveBeenCalled();
  });

  it("loading 中は解析中の表示になる", () => {
    render(<Narration paragraphs={[]} loading />);
    expect(screen.getByText(/解析中/)).toBeInTheDocument();
  });
});
