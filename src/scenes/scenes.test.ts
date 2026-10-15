import { describe, expect, it } from "vitest";
import { FIRST_SCENE, SCENES, SCENE_MAP } from "./scenes";

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
