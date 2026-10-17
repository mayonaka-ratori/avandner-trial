/** 人名は長い表記を先に照合し、同じ名前を途中で分けない。 */
export const STORY_NAMES = [
  "アイカ・ゲフェス",
  "ニームハイン",
  "ガブリエッラ",
  "ロレッタ",
  "ステラ",
  "アイカ",
  "姉貴分",
  "ザイラ",
];

export interface StoryBlock {
  kind: "narration" | "dialogue";
  text: string;
}

/**
 * 台詞と説明を分ける。店名や「偽物」など、文の中の引用は説明のまま。
 * 閉じかっこのない生成文や表示途中の台詞も、そのまま表示する。
 */
export function splitStoryBlocks(text: string): StoryBlock[] {
  const blocks: StoryBlock[] = [];
  let start = 0;
  let quoteStart = -1;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "「") {
      if (depth === 0) {
        const before = text.slice(start, i);
        const prefix = before.trimEnd();
        const beginsSpeech = prefix === "" || /\n\s*$/.test(before) || /[。！？!?」：:]$/.test(prefix)
          || STORY_NAMES.some((name) => prefix.endsWith(name));
        if (beginsSpeech) {
          if (i > start) blocks.push({ kind: "narration", text: text.slice(start, i) });
          quoteStart = i;
        }
      }
      depth++;
    } else if (text[i] === "」" && depth > 0) {
      depth--;
      if (depth === 0 && quoteStart >= 0) {
        blocks.push({ kind: "dialogue", text: text.slice(quoteStart, i + 1) });
        start = i + 1;
        quoteStart = -1;
      }
    }
  }
  if (start < text.length) {
    blocks.push({
      kind: quoteStart >= 0 ? "dialogue" : "narration",
      text: text.slice(quoteStart >= 0 ? quoteStart : start),
    });
  }
  return blocks;
}

/** 句点と疑問符・感嘆符で改行する。連続する記号と閉じかっこは前の文に付ける。 */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^。！？!?\n]+[。！？!?]*[」』）)]*|[。！？!?]+[」』）)]*|\n+/g) ?? [];
  const sentences: string[] = [];
  let leadingSpace = "";
  for (const part of parts) {
    if (!part.trim()) {
      // 生成文の改行だけで空の行をもう一つ作らない。
      if (sentences.length > 0) sentences[sentences.length - 1] += part;
      else leadingSpace += part;
    } else {
      sentences.push(leadingSpace + part);
      leadingSpace = "";
    }
  }
  return sentences.length > 0 ? sentences : leadingSpace ? [leadingSpace] : [];
}
