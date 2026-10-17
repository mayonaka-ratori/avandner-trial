import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getScene } from "@/scenes/scenes";
import { SceneView } from "./SceneView";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("場面を読むときの操作", () => {
  it("全文表示後も読み始めの位置を保ち、送信後は返事の先頭へ移る", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    const user = userEvent.setup();
    render(<SceneView scene={getScene("awakening")} offline onAdvance={() => {}} />);
    await screen.findByRole("textbox", { name: "目覚めたあなたの、第一声は？" });
    expect(screen.queryByRole("button", { name: "全文を表示する" })).not.toBeInTheDocument();
    expect(scroll).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "言葉にしないで進む" }));
    const reply = await screen.findByRole("region", { name: "返事" });
    expect(reply).toHaveFocus();
    expect(scroll).toHaveBeenCalledWith({ block: "start" });
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "つづきへ" })).toBeInTheDocument();
  });

  it("文字の大きさを次の場面にも引き継ぐ", async () => {
    const user = userEvent.setup();
    const first = render(<SceneView scene={getScene("awakening")} offline onAdvance={() => {}} />);
    await user.click(screen.getByRole("button", { name: "文字を大きく" }));
    expect(screen.getByRole("button", { name: "文字を大きく" })).toHaveAttribute("aria-pressed", "true");
    first.unmount();
    render(<SceneView scene={getScene("city")} offline onAdvance={() => {}} />);
    expect(screen.getByRole("button", { name: "文字を大きく" })).toHaveAttribute("aria-pressed", "true");
  });

  it("保存が使えない場合も文字の大きさを変えられる", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("unavailable"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("unavailable"); });
    render(<SceneView scene={getScene("city")} offline onAdvance={() => {}} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "文字を大きく" }));
    expect(screen.getByRole("button", { name: "文字を大きく" })).toHaveAttribute("aria-pressed", "true");
  });
});
