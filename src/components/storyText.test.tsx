import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SCENES } from "@/scenes/scenes";
import { StoryText } from "./StoryText";
import { splitSentences, splitStoryBlocks } from "./storyFormatting";

describe("物語の文章の区切り", () => {
  it("文ごとに改行し、連続する記号や閉じかっこを次の行に残さない", () => {
    expect(splitSentences("「大丈夫。行こう！？」次の文。最後"))
      .toEqual(["「大丈夫。", "行こう！？」", "次の文。", "最後"]);
  });

  it("生成文に既に改行があっても空の文を増やさない", () => {
    const text = "最初の文。\n次の文。\n最後の文。";
    const sentences = splitSentences(text);
    expect(sentences).toHaveLength(3);
    expect(sentences.join("")).toBe(text);
  });

  it("地の文と台詞が同じ段落にあっても分ける", () => {
    expect(splitStoryBlocks("ニームハインが微笑む。「おはよう。元気？」彼女が立つ。"))
      .toEqual([
        { kind: "narration", text: "ニームハインが微笑む。" },
        { kind: "dialogue", text: "「おはよう。元気？」" },
        { kind: "narration", text: "彼女が立つ。" },
      ]);
  });

  it("句点がなくても改行の後の台詞を分ける", () => {
    expect(splitStoryBlocks("彼女は振り返り\n「行こう」"))
      .toEqual([
        { kind: "narration", text: "彼女は振り返り\n" },
        { kind: "dialogue", text: "「行こう」" },
      ]);
  });

  it("店名と文中の引用を台詞にしない", () => {
    const text = "パブ「スターダスト」に着く。彼女も「偽物」だと知っている。";
    expect(splitStoryBlocks(text)).toEqual([{ kind: "narration", text }]);
  });

  it("台詞の中の引用と、閉じかっこが欠けた台詞も失わない", () => {
    const nested = "「彼女が「行くよ」と言った。私も行こう」";
    expect(splitStoryBlocks(nested)).toEqual([{ kind: "dialogue", text: nested }]);
    expect(splitStoryBlocks("頷く。「一緒に行こう。"))
      .toEqual([
        { kind: "narration", text: "頷く。" },
        { kind: "dialogue", text: "「一緒に行こう。" },
      ]);
  });

  it("全場面・選択後の返事の本文を一文字も失わない", () => {
    const texts = SCENES.flatMap((scene) => [
      ...scene.fallback,
      ...(scene.interaction.type === "free" ? scene.interaction.replyFallback : []),
      ...(scene.interaction.type === "choice" ? scene.interaction.options.flatMap((opt) => opt.response) : []),
    ]);
    for (const text of texts) {
      const blocks = splitStoryBlocks(text);
      expect(blocks.map((block) => block.text).join("")).toBe(text);
      expect(blocks.flatMap((block) => splitSentences(block.text)).join("")).toBe(text);
    }
  });

  it("生成文でも名前を強調し、台詞を別に表示する", () => {
    const text = "ニームハインが語りかけます。「さあ、アイカ・ゲフェスが待っているよ。大丈夫！」あなたは目を開けます。";
    const { container } = render(<StoryText text={text} />);
    expect(container.textContent).toBe(text);
    expect([...container.querySelectorAll("strong")].map((el) => el.textContent))
      .toEqual(["ニームハイン", "アイカ・ゲフェス"]);
    expect(container.querySelector(".story-dialogue")?.textContent)
      .toBe("「さあ、アイカ・ゲフェスが待っているよ。大丈夫！」");
    expect(container.querySelectorAll(".story-sentence")).toHaveLength(4);
  });
});
