import { useEffect, useMemo, useRef, useState } from "react";
import { StoryText } from "./StoryText";

interface NarrationProps {
  paragraphs: string[];
  /** LLM の語りを待っている間の表示 */
  loading?: boolean;
  /** true ならタイプライターせず即座に全文表示する（テスト・検証用） */
  instant?: boolean;
  /** 全文を表示しきったときに一度だけ呼ばれる */
  onRevealed?: () => void;
}

const MAX_MS_PER_PARAGRAPH = 2200;
const PARAGRAPH_PAUSE = 220;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  // OS/ブラウザの設定変更にも追従する
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/**
 * 場面の本文。段落をタイプライターで順に出す。
 * 本文エリアのタップで全文を一括表示する（スキップ）。
 * 長い段落は速くなるよう速度を自動調整し、1段落あたりの表示時間に上限を設ける。
 */
export function Narration({
  paragraphs,
  loading,
  instant = false,
  onRevealed,
}: NarrationProps) {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);
  const revealedRef = useRef(false);

  const { total, boundaries } = useMemo(() => {
    let acc = 0;
    const bounds: number[] = [];
    for (const p of paragraphs) {
      acc += p.length;
      bounds.push(acc);
    }
    return { total: acc, boundaries: bounds };
  }, [paragraphs]);

  // 一番長い段落でも MAX_MS_PER_PARAGRAPH 以内に出きる速度にする
  const interval = useMemo(() => {
    const maxLen = Math.max(1, ...paragraphs.map((p) => p.length));
    return Math.min(55, Math.max(12, Math.floor(MAX_MS_PER_PARAGRAPH / maxLen)));
  }, [paragraphs]);

  const done = count >= total;

  // 段落が差し替わったらタイピングを最初からやり直す
  // （同じ配列参照が続く限りこの effect は走らず、タイピングは継続する）
  useEffect(() => {
    setCount(0);
    revealedRef.current = false;
  }, [paragraphs]);

  useEffect(() => {
    if (loading || total === 0) return;
    if (instant || reduced) {
      setCount(total);
      return;
    }
    if (done) return;
    // 段落の切れ目では少し間を置く
    const atBoundary = boundaries.includes(count);
    const t = setTimeout(
      () => setCount((n) => n + 1),
      atBoundary ? interval + PARAGRAPH_PAUSE : interval,
    );
    return () => clearTimeout(t);
  }, [count, done, total, interval, boundaries, instant, reduced, loading]);

  useEffect(() => {
    // loading 中（段落なし）は done=true になってしまうので発火させない
    if (!loading && total > 0 && done && !revealedRef.current) {
      revealedRef.current = true;
      onRevealed?.();
    }
  }, [done, loading, total, onRevealed]);

  if (loading) {
    return (
      <div role="status" className="flex items-center gap-3 py-8 text-hud-text-muted">
        <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-hud-gold" />
        <span className="text-sm">
          文章を準備しています…
        </span>
      </div>
    );
  }

  // 表示済み文字数を段落に割り振る
  let remaining = count;
  return (
    <div
      className={
        done
          ? "story-text"
          : "story-text rounded-sm focus:outline-none focus:ring-1 focus:ring-hud-gold/50"
      }
      onClick={() => setCount(total)}
      onKeyDown={
        done
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault(); // Space によるスクロールを防ぐ
                setCount(total);
              }
            }
      }
      role={done ? undefined : "button"}
      aria-label={done ? undefined : "全文を表示する"}
      tabIndex={done ? undefined : 0}
    >
      {paragraphs.map((p, i) => {
        const shown = Math.max(0, Math.min(p.length, remaining));
        remaining -= p.length;
        if (shown === 0) return null;
        const typing = shown < p.length;
        return (
          <div key={i} className="story-paragraph">
            <StoryText text={p.slice(0, shown)} />
            {typing && <span className="type-caret" aria-hidden="true" />}
            {!typing && !done && i === lastVisible(paragraphs, count) && (
              <span className="type-caret" aria-hidden="true" />
            )}
          </div>
        );
      })}
      {/* タイピング中だけ出すスキップ案内。タップ対象は親の領域全体 */}
      {!done && (
        <p
          className="pt-1 text-right font-mono-hud text-[11px] tracking-[0.2em] text-hud-gold-dim"
          aria-hidden="true"
        >
          押すと全文を表示します
        </p>
      )}
    </div>
  );
}

/** いま文字を出している段落の番号（カーソルを置く位置） */
function lastVisible(paragraphs: string[], count: number): number {
  let acc = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    acc += paragraphs[i].length;
    if (count <= acc) return i;
  }
  return paragraphs.length - 1;
}
