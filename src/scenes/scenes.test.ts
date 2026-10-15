import { describe, expect, it } from "vitest";
import { endingExtras, FIRST_SCENE, SCENES, SCENE_MAP } from "./scenes";
import { SCENE_PROMPTS } from "../../api/narrate";
import type { ChoiceRecord } from "./types";

describe("シーン定義", () => {
  it("最初のシーンが存在する", () => {
    expect(SCENE_MAP.has(FIRST_SCENE)).toBe(true);
  });

  it("全シーンに fallback の本文がある（APIなしで完走できる）", () => {
    for (const scene of SCENES) {
      expect(scene.fallback.length, scene.id).toBeGreaterThan(0);
      for (const p of scene.fallback) {
        expect(p.trim().length, scene.id).toBeGreaterThan(0);
      }
    }
  });

  it("next の行き先が全部存在するシーンを指す", () => {
    for (const scene of SCENES) {
      if (scene.next) {
        expect(SCENE_MAP.has(scene.next), `${scene.id} -> ${scene.next}`).toBe(true);
      }
    }
  });

  it("choice の選択肢に応答文がある", () => {
    for (const scene of SCENES) {
      if (scene.interaction.type === "choice") {
        for (const opt of scene.interaction.options) {
          expect(opt.response.length, `${scene.id}/${opt.label}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("同じシーン内で選択肢の id が重複していない", () => {
    for (const scene of SCENES) {
      if (scene.interaction.type === "choice") {
        const ids = scene.interaction.options.map((opt) => opt.id);
        for (const id of ids) {
          expect(id.trim().length, `${scene.id} の空の id`).toBeGreaterThan(0);
        }
        expect(new Set(ids).size, scene.id).toBe(ids.length);
      }
    }
  });

  it("free 入力のシーンには予備の返答がある", () => {
    for (const scene of SCENES) {
      if (scene.interaction.type === "free") {
        expect(scene.interaction.replyFallback.length, scene.id).toBeGreaterThan(0);
      }
    }
  });

  it("combat 以外のシーンは next か ending 経路を持つ", () => {
    for (const scene of SCENES) {
      const t = scene.interaction.type;
      if (t === "combat" || t === "ending") continue;
      expect(scene.next, scene.id).toBeTruthy();
    }
  });

  it("narrationKey と free 入力の返答キーが API 側のプロンプトと対応している", () => {
    for (const scene of SCENES) {
      if (scene.narrationKey) {
        expect(
          SCENE_PROMPTS[scene.narrationKey],
          `narrationKey: ${scene.narrationKey}`,
        ).toBeTruthy();
      }
      if (scene.interaction.type === "free") {
        expect(
          SCENE_PROMPTS[`reply-${scene.id}`],
          `reply key: reply-${scene.id}`,
        ).toBeTruthy();
      }
    }
  });

  it("最初から最後まで一本道で辿り着ける", () => {
    const visited = new Set<string>();
    let cur: string | undefined = FIRST_SCENE;
    while (cur) {
      expect(visited.has(cur), `循環: ${cur}`).toBe(false);
      visited.add(cur);
      const scene = SCENE_MAP.get(cur);
      cur = scene && scene.interaction.type !== "ending" ? scene.next : undefined;
    }
    expect(visited.has("ending")).toBe(true);
    expect(visited.size).toBe(SCENES.length);
  });
});

describe("endingExtras", () => {
  it("gabriella で dismiss を選ぶと「流した噂」の追記文が入る", () => {
    const log: ChoiceRecord[] = [
      {
        sceneId: "gabriella",
        optionId: "dismiss",
        label: "胡散臭い話だ。流そう",
      },
    ];
    const extras = endingExtras(log, "won");
    expect(extras.some((p) => p.includes("流した噂"))).toBe(true);
  });

  it("自由入力に「流そう」が含まれても誤発火しない", () => {
    const log: ChoiceRecord[] = [
      { sceneId: "awakening", label: "噂は流そうと思う" },
    ];
    const extras = endingExtras(log, "won");
    expect(extras.some((p) => p.includes("流した噂"))).toBe(false);
  });

  it("lost-then-won では敗北の追記文が入る", () => {
    const extras = endingExtras([], "lost-then-won");
    expect(extras.length).toBeGreaterThan(0);
  });
});
