import { STORY_NAMES, splitSentences, splitStoryBlocks } from "./storyFormatting";

const NAME_PATTERN = new RegExp(`(${STORY_NAMES.join("|")})`, "g");
const NAME_SET = new Set(STORY_NAMES);

export function StoryInline({ text }: { text: string }) {
  return text.split(NAME_PATTERN).map((part, i) =>
    NAME_SET.has(part)
      ? <strong className="story-name" key={i}>{part}</strong>
      : part,
  );
}

export function StoryText({ text }: { text: string }) {
  return splitStoryBlocks(text).filter((block) => block.text.trim()).map((block, i) => (
    <p key={i} className={block.kind === "dialogue" ? "story-dialogue" : "story-description"}>
      {splitSentences(block.text).map((sentence, j) => (
        <span key={j} className="story-sentence"><StoryInline text={sentence} /></span>
      ))}
    </p>
  ));
}
