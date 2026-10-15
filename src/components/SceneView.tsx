import { useEffect, useRef, useState } from "react";
import { ChevronRight, Send } from "lucide-react";
import type { SceneDef } from "@/scenes/types";
import { narrate } from "@/api/client";
import { endingExtras } from "@/scenes/scenes";
import { Narration } from "./Narration";

/** テスト環境ではタイプライターを即時完了させる（vitest は MODE=test） */
const INSTANT_TEXT = import.meta.env.MODE === "test";

interface SceneViewProps {
  scene: SceneDef;
  /** 進む。choice / free でプレイヤーが入力した内容を記録するための引数 */
  onAdvance: (record?: string) => void;
  /** エンディングの総括用にこれまでの選択履歴を渡す */
  choiceLog?: string[];
  battleResult?: "won" | "lost-then-won";
  /** 体験開始時刻。エンディングの経過時間表示に使う */
  startedAt?: number;
  /**
   * true なら API を呼ばず常に予備文章を使う。
   * 起動時の状態確認が失敗した（＝通信が不安定な）ときに立つ。
   */
  offline?: boolean;
}

/**
 * 1 場面の表示。narrationKey があれば LLM の語りを取り、
 * 失敗したら fallback の文章に切り替える。
 * 本文はタイプライターで出し、出し切ってから操作を見せる。
 */
export function SceneView({
  scene,
  onAdvance,
  choiceLog,
  battleResult,
  startedAt,
  offline = false,
}: SceneViewProps) {
  const [text, setText] = useState<string[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [response, setResponse] = useState<string[]>([]);
  const [responseRevealed, setResponseRevealed] = useState(false);
  const [freeSent, setFreeSent] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const it = scene.interaction;

  // 場面の本文。narrationKey があれば API の語りを優先し、なければ fallback
  useEffect(() => {
    let cancelled = false;
    setText(null);
    setRevealed(false);
    setPicked(null);
    setResponse([]);
    setResponseRevealed(false);
    setFreeSent(false);
    setFreeText("");

    // オフライン時は語りの取得を試みない（毎シーン15秒待つのを防ぐ）
    if (!scene.narrationKey || offline) {
      const base = scene.fallback;
      const extras =
        scene.id === "ending"
          ? endingExtras(choiceLog ?? [], battleResult ?? "won")
          : [];
      setText([...base, ...extras]);
      return;
    }
    narrate(scene.narrationKey, {
      choices: scene.id === "ending" ? choiceLog : undefined,
      battleResult: scene.id === "ending" ? battleResult : undefined,
    }).then((generated) => {
      if (cancelled) return;
      // 生成文は段落区切り（空行）で配列化。失敗時は fallback
      const paragraphs = generated
        ? generated.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
        : scene.fallback;
      const extras =
        scene.id === "ending"
          ? endingExtras(choiceLog ?? [], battleResult ?? "won")
          : [];
      setText(
        [...(paragraphs.length > 0 ? paragraphs : scene.fallback), ...extras],
      );
    });
    return () => {
      cancelled = true;
    };
  }, [scene, choiceLog, battleResult, offline]);

  // 応答文が差し込まれたら下までスクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [response, freeSent]);

  const paragraphs = text ?? [];
  // 操作の表示は「本文が出て、さらに応答文も出し切ってから」
  const ready = revealed && (response.length === 0 || responseRevealed);

  async function submitFree() {
    const input = freeText.trim();
    if (!input || busy || it.type !== "free") return;
    setBusy(true);
    const reply = offline
      ? null
      : await narrate(`reply-${scene.id}`, { freeInput: input });
    setResponseRevealed(false);
    setResponse(
      reply
        ? reply.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
        : it.replyFallback,
    );
    setFreeSent(true);
    setBusy(false);
  }

  function pick(label: string, res: string[]) {
    setPicked(label);
    setResponseRevealed(false);
    setResponse(res);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-8 pt-10">
      {scene.alert && (
        <p className="alert-pulse mb-4 inline-block w-fit rounded border border-hud-copper/60 bg-hud-copper/10 px-3 py-1 font-mono-hud text-[10px] tracking-[0.3em] text-hud-copper">
          {scene.alert}
        </p>
      )}
      <h2 className="mb-6 mt-1 border-b border-hud-border pb-3 text-xl text-hud-heading">
        {scene.title}
      </h2>

      <Narration
        paragraphs={paragraphs}
        loading={text === null}
        instant={INSTANT_TEXT}
        onRevealed={() => setRevealed(true)}
      />

      {response.length > 0 && (
        <div className="mt-4 border-l-2 border-hud-gold/40 pl-4">
          <Narration
            paragraphs={response}
            instant={INSTANT_TEXT}
            onRevealed={() => setResponseRevealed(true)}
          />
        </div>
      )}

      <div ref={bottomRef} className="mt-8" />

      {ready && it.type === "continue" && (
        <ContinueButton onClick={() => onAdvance()} />
      )}

      {revealed && it.type === "choice" && picked === null && (
        <div className="mt-2 space-y-3">
          {it.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => pick(opt.label, opt.response)}
              className="beat-in block w-full rounded-md border border-hud-border bg-hud-panel px-4 py-3 text-left text-sm leading-relaxed text-hud-text transition-colors hover:border-hud-gold/60 hover:text-hud-gold-bright"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {ready && it.type === "choice" && picked !== null && (
        <ContinueButton onClick={() => onAdvance(picked)} />
      )}

      {revealed && it.type === "free" && !freeSent && (
        <div className="mt-2">
          <p className="mb-1 font-mono-hud text-[9px] tracking-[0.3em] text-hud-gold-dim">
            &gt; VOICE OUT
          </p>
          <p className="mb-2 text-sm text-hud-text-muted">{it.prompt}</p>
          <div className="flex gap-2">
            <input
              value={freeText}
              onChange={(e) => setFreeText(e.target.value.slice(0, 200))}
              onKeyDown={(e) => e.key === "Enter" && submitFree()}
              placeholder={it.placeholder}
              className="min-w-0 flex-1 rounded-md border border-hud-border bg-hud-panel px-3 py-2.5 text-sm text-hud-text placeholder:text-hud-text-muted/70 focus:border-hud-gold/60 focus:outline-none"
            />
            <button
              onClick={submitFree}
              disabled={!freeText.trim() || busy}
              className="flex items-center gap-1.5 rounded-md border border-hud-gold/50 bg-hud-gold/10 px-4 py-2.5 text-sm text-hud-gold-bright transition-colors hover:bg-hud-gold/20 disabled:opacity-40"
            >
              <Send size={14} />
              {busy ? "…" : "言う"}
            </button>
          </div>
          <button
            onClick={() => {
              setResponseRevealed(false);
              setResponse(it.replyFallback);
              setFreeSent(true);
            }}
            className="mt-3 text-xs text-hud-text-muted underline underline-offset-4 hover:text-hud-text"
          >
            言葉にしないで進む
          </button>
        </div>
      )}

      {ready && it.type === "free" && freeSent && (
        <ContinueButton
          onClick={() => onAdvance(freeText.trim() || undefined)}
        />
      )}

      {ready && it.type === "ending" && (
        <EndingExtras
          onRestart={() => onAdvance()}
          choiceLog={choiceLog ?? []}
          battleResult={battleResult ?? "won"}
          startedAt={startedAt}
        />
      )}
    </div>
  );
}

function ContinueButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="beat-in mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-hud-gold/50 bg-hud-gold/10 px-6 py-3 text-hud-gold-bright transition-colors hover:bg-hud-gold/20"
    >
      つづきへ
      <ChevronRight size={16} />
    </button>
  );
}

function EndingExtras({
  onRestart,
  choiceLog,
  battleResult,
  startedAt,
}: {
  onRestart: () => void;
  choiceLog: string[];
  battleResult: "won" | "lost-then-won";
  startedAt?: number;
}) {
  const elapsedMin =
    startedAt !== undefined
      ? Math.max(1, Math.round((Date.now() - startedAt) / 60000))
      : null;
  return (
    <div className="mt-6 space-y-4 border-t border-hud-border pt-6">
      <p className="stamp-in text-center font-mono-hud text-lg tracking-[0.4em] text-hud-gold">
        ― END ―
      </p>
      {/* 作戦記録 */}
      <div className="rounded-md border border-hud-border bg-hud-panel/60 p-3">
        <p className="mb-2 font-mono-hud text-[9px] tracking-[0.3em] text-hud-gold-dim">
          MISSION RECORD
        </p>
        <dl className="space-y-1 text-xs text-hud-text-muted">
          <div className="flex justify-between">
            <dt>作戦結果</dt>
            <dd className="text-hud-text">
              {battleResult === "won" ? "初戦で撃破" : "再突入の末に撃破"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>選択の記録</dt>
            <dd className="text-hud-text">{choiceLog.length} 件</dd>
          </div>
          {elapsedMin !== null && (
            <div className="flex justify-between">
              <dt>経過時間</dt>
              <dd className="text-hud-text">約 {elapsedMin} 分</dd>
            </div>
          )}
        </dl>
      </div>
      <p className="text-center text-xs leading-relaxed text-hud-text-muted">
        遊んでいただきありがとうございました。
        <br />
        この世界の続きは、TRPG『黒絢のアヴァンドナー』本編で。
      </p>
      <button
        onClick={onRestart}
        className="flex w-full items-center justify-center gap-1 rounded-md border border-hud-border bg-hud-panel px-6 py-3 text-sm text-hud-text transition-colors hover:border-hud-gold/60 hover:text-hud-gold-bright"
      >
        もう一度遊ぶ
      </button>
    </div>
  );
}
