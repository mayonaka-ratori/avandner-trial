/**
 * App.playthrough.test.tsx — 予備文章版のランスルー（プレイヤータイプ別）
 *
 * fetch を全て失敗させて「予備文章モード」にし、タイトルから
 * エンディングまで実際の UI をクリックで踏み抜く。
 * プレイヤーの型ごとに、かかったタップ数・戦闘ラウンド数・敗北回数を記録する。
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

interface RunStats {
  taps: number;
  rounds: number;
  lost: number;
  endingReached: boolean;
}

interface PlayPattern {
  name: string;
  firstWords: string;
  prebattleWords: string;
  /** 選択肢の label を受け取って、押すボタンの label を返す */
  pick: (labels: string[]) => string;
  attack: () => "slash" | "double";
  overdrive?: boolean;
  evade: boolean;
}

const ATTACK_LABEL = {
  slash: /黒絢で斬る/,
  double: /ダブルトリガー/,
} as const;

/** fetch を全部失敗させる＝API が死んでいて予備文章だけで動く状態 */
beforeEach(() => {
  // ダイスの出目を再現できるようにし、偶然の連敗で公開の検査が落ちるのを防ぐ。
  let seed = 12345;
  vi.spyOn(Math, "random").mockImplementation(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("network down")),
  );
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

async function runThrough(pattern: PlayPattern): Promise<RunStats> {
  const user = userEvent.setup();
  const stats: RunStats = { taps: 0, rounds: 0, lost: 0, endingReached: false };
  const tap = async (el: Element) => {
    await user.click(el);
    stats.taps += 1;
  };

  render(<App />);

  // ── タイトル ──────────────────────────────
  await tap(await screen.findByRole("button", { name: /物語をはじめる/ }));

  // ── 起動シーケンス（タップでスキップ） ────
  await tap(await screen.findByRole("button", { name: /起動シーケンス/ }));

  // ── 覚醒（自由入力） ──────────────────────
  await screen.findByText(/目覚めたあなたの、第一声は/);
  await user.type(screen.getByRole("textbox"), pattern.firstWords);
  await tap(screen.getByRole("button", { name: /言う/ }));
  await tap(await screen.findByRole("button", { name: /つづきへ/ }));

  // ── 街の案内（continue） ──────────────────
  await screen.findByText("街の案内");
  await tap(await screen.findByRole("button", { name: /つづきへ/ }));

  // ── パブ（choice） ────────────────────────
  await screen.findByText("パブ「スターダスト」");
  await pickChoice(user, stats, pattern, screen);

  // ── 不吉な噂（choice） ────────────────────
  await screen.findByText("不吉な噂");
  await pickChoice(user, stats, pattern, screen);

  // ── ミッション（choice） ──────────────────
  await screen.findByText("ミッション");
  await pickChoice(user, stats, pattern, screen);

  // ── 出撃前（自由入力） ────────────────────
  await screen.findByText(/発進前、姉貴分にかける言葉は/);
  await user.type(screen.getByRole("textbox"), pattern.prebattleWords);
  await tap(screen.getByRole("button", { name: /言う/ }));
  await tap(await screen.findByRole("button", { name: /つづきへ/ }));

  // ── 超高速突入 → 戦闘 ────────────────────
  await screen.findByText("超高速突入");
  for (let guard = 0; guard < 300; guard++) {
    // 本文の下に出る交戦開始ボタン。押すと戦闘UIがマウントされる
    const engage = screen.queryByRole("button", { name: /ザイラに交戦する/ });
    if (engage) {
      await tap(engage);
      expect(screen.queryByRole("heading", { name: "超高速突入" })).not.toBeInTheDocument();
      expect(screen.queryByText(/ロケットブースタによる音速超過/)).not.toBeInTheDocument();
      continue;
    }
    const roll = screen.queryByRole("button", { name: "ダイスを振る" });
    if (roll) {
      await tap(roll);
      continue;
    }
    const commitCharge = screen.queryByRole("button", { name: "範囲外へ移動する" });
    if (commitCharge) {
      await tap(commitCharge);
      continue;
    }
    const end = screen.queryByRole("button", { name: /エンディングへ/ });
    if (end) {
      await tap(end);
      break;
    }
    const retry = screen.queryByRole("button", { name: /もう一度挑戦する/ });
    if (retry) {
      stats.lost += 1;
      await tap(retry);
      continue;
    }
    const options = screen.queryAllByRole("button", { name: /ジグスラストで/ });
    const evade = options.find((el) => el.textContent?.includes("攻撃範囲の外")) ?? options[0];
    if (evade) {
      // 残りZSがコスト以下だと回避ボタンは無効化されるので受ける側を押す
      const usable = pattern.evade && !(evade as HTMLButtonElement).disabled;
      await tap(
        usable
          ? evade
          : screen.getByRole("button", { name: /そのまま受ける/ }),
      );
      continue;
    }
    const next = screen.queryByRole("button", { name: /次のラウンドへ/ });
    if (next) {
      await tap(next);
      continue;
    }
    if (pattern.overdrive) {
      const route = screen.queryByRole("radio", { name: /超過移動で/ });
      if (route && !(route as HTMLInputElement).disabled) await tap(route);
    }
    // 攻撃を選ぶ
    const candidates = [
      ATTACK_LABEL[pattern.attack()],
      /黒絢で斬る/,
    ];
    const attack = candidates
      .map((re) => screen.queryByRole("button", { name: re }))
      .find((el) => el !== null);
    if (attack) {
      stats.rounds += 1;
      await tap(attack);
      continue;
    }
    throw new Error("戦闘画面で押せるものが見つからない");
  }

  // ── エンディング ──────────────────────────
  await screen.findByText("帰還");
  await screen.findByRole("button", { name: /もう一度遊ぶ/ });
  stats.endingReached = true;

  return stats;
}

async function pickChoice(
  user: ReturnType<typeof userEvent.setup>,
  stats: RunStats,
  pattern: PlayPattern,
  scr: typeof screen,
) {
  // 選択肢は border-hud-border のボタン。見出し等と区別するため
  // 「つづきへ」が出るまで choice ボタンを探す
  const buttons = within(await scr.findByRole("group", { name: "返答を選ぶ" })).getAllByRole("button");
  const labels = buttons
    .map((b) => b.textContent ?? "")
    .filter((t) => t !== "" && !/つづきへ/.test(t));
  const want = pattern.pick(labels);
  const btn = buttons.find((b) => (b.textContent ?? "").includes(want));
  if (!btn) throw new Error(`選択肢が見つからない: ${want} in [${labels}]`);
  await user.click(btn);
  stats.taps += 1;
  await tap(await scr.findByRole("button", { name: /つづきへ/ }));

  async function tap(el: Element) {
    await user.click(el);
    stats.taps += 1;
  }
}

describe("予備文章版ランスルー", () => {
  it(
    "A: ロールプレイ重視型 — 自由入力に気持ちを込め、物語の選択を取る",
    async () => {
      const stats = await runThrough({
        name: "roleplay",
        firstWords: "……おはよう。あなたが、私のお姉ちゃん？",
        prebattleWords: "行ってきます。必ず帰るから",
        pick: (labels) =>
          labels.find((l) => /気になる|ステラの兄|楽しみ/.test(l)) ?? labels[0],
        attack: () => "slash",
        evade: true,
      });
      expect(stats.endingReached).toBe(true);
      console.log(`[A ロールプレイ型] taps=${stats.taps} rounds=${stats.rounds} lost=${stats.lost}`);
    },
    60_000,
  );

  it(
    "B: 移動重視型 — 超過移動で威力を増やす、回避なし",
    async () => {
      const stats = await runThrough({
        name: "optimizer",
        firstWords: "はい",
        prebattleWords: "了解",
        pick: (labels) => labels[0],
        attack: () => "slash",
        overdrive: true,
        evade: false,
      });
      expect(stats.endingReached).toBe(true);
      console.log(`[B 最適解型] taps=${stats.taps} rounds=${stats.rounds} lost=${stats.lost}`);
    },
    60_000,
  );

  it(
    "C: 初見・直感型 — 先頭の選択肢、通常攻撃のみ、回避しない",
    async () => {
      const stats = await runThrough({
        name: "newbie",
        firstWords: "？",
        prebattleWords: "！",
        pick: (labels) => labels[labels.length - 1],
        attack: () => "slash",
        evade: false,
      });
      expect(stats.endingReached).toBe(true);
      console.log(`[C 初見直感型] taps=${stats.taps} rounds=${stats.rounds} lost=${stats.lost}`);
    },
    60_000,
  );
});
