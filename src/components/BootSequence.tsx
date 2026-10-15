import { useEffect, useState } from "react";

/**
 * 起動シーケンス。
 * 「物語をはじめる」のあと、機械の起動ログを1行ずつ流して覚醒シーンへ繋ぐ。
 * 培養槽から目覚める物語の導入として、アヴァンドナー自身の OS が立ち上がる
 * 演出になっている。画面タップで即スキップできる。
 */
const BOOT_LINES = [
  "GEODESIC SPHERE — SYSTEM CHECK",
  "ZS 出力 …… 安定",
  "培養脳リンク …… 確立",
  "視覚モジュール …… 起動",
  "聴覚モジュール …… 起動",
  "運動系 …… ALL GREEN",
  "――ようこそ、世界へ。",
];

/** 各行の表示間隔（ms）。最後の行だけ少し間を置く */
const LINE_INTERVAL = 650;
const FINAL_DELAY = 900;

interface BootSequenceProps {
  onDone: () => void;
  /** テスト用：true なら待たずに全行表示＋即 done 可能 */
  instant?: boolean;
}

export function BootSequence({ onDone, instant = false }: BootSequenceProps) {
  const [shown, setShown] = useState(instant ? BOOT_LINES.length : 0);

  // 一定間隔で行を増やす（interval 型なので偽タイマーのテストとも相性が良い）
  useEffect(() => {
    if (instant) return;
    const id = setInterval(
      () => setShown((n) => Math.min(n + 1, BOOT_LINES.length)),
      LINE_INTERVAL,
    );
    return () => clearInterval(id);
  }, [instant]);

  // 全行出し切ったら余韻を置いて終了
  useEffect(() => {
    if (shown < BOOT_LINES.length) return;
    const t = setTimeout(onDone, instant ? 300 : FINAL_DELAY);
    return () => clearTimeout(t);
  }, [shown, onDone, instant]);

  return (
    <button
      type="button"
      onClick={onDone}
      className="flex min-h-dvh w-full cursor-pointer flex-col items-start justify-center px-8 text-left"
      aria-label="起動シーケンス（タップでスキップ）"
    >
      <div className="space-y-2 font-mono-hud text-xs leading-relaxed text-hud-gold sm:text-sm">
        {BOOT_LINES.slice(0, shown).map((line, i) => (
          <p key={i} className="beat-in">
            <span className="mr-2 text-hud-gold-dim">&gt;</span>
            {line}
          </p>
        ))}
        {shown < BOOT_LINES.length && (
          <p className="type-caret text-hud-gold" aria-hidden="true" />
        )}
      </div>
      <p className="mt-10 font-mono-hud text-[9px] tracking-[0.3em] text-hud-text-muted/60">
        TAP TO SKIP
      </p>
    </button>
  );
}
