import { useEffect, useRef, useState } from "react";
import { ChevronRight, Send } from "lucide-react";
import type { SceneDef } from "@/scenes/types";
import { narrate } from "@/api/client";
import { Narration } from "./Narration";

interface SceneViewProps {
  scene: SceneDef;
  /** 進む。choice / free でプレイヤーが入力した内容を記録するための引数 */
  onAdvance: (record?: string) => void;
  /** エンディングの総括用にこれまでの選択履歴を渡す */
  choiceLog?: string[];
  battleResult?: "won" | "lost-then-won";
}

/**
 * 1 場面の表示。narrationKey があれば LLM の語りを取り、
 * 失敗したら fallback の文章に切り替える。
 */
export function SceneView({ scene, onAdvance, choiceLog, battleResult }: SceneViewProps) {
  const [text, setText] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [response, setResponse] = useState<string[]>([]);
  const [freeSent, setFreeSent] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const it = scene.interaction;

  // 場面の本文。narrationKey があれば API の語りを優先し、なければ fallback
  useEffect(() => {
    let cancelled = false;
    setText(null);
    setPicked(null);
    setResponse([]);
    setFreeSent(false);
    setFreeText("");

    if (!scene.narrationKey) {
      setText(scene.fallback);
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
      setText(paragraphs.length > 0 ? paragraphs : scene.fallback);
    });
    return () => {
      cancelled = true;
    };
  }, [scene, choiceLog, battleResult]);

  // 応答文が差し込まれたら下までスクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [response, freeSent]);

  const paragraphs = text ?? [];

  async function submitFree() {
    const input = freeText.trim();
    if (!input || busy || it.type !== "free") return;
    setBusy(true);
    const reply = await narrate(`reply-${scene.id}`, { freeInput: input });
    setResponse(
      reply
        ? reply.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
        : it.replyFallback,
    );
    setFreeSent(true);
    setBusy(false);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-8 pt-10">
      {scene.kicker && (
        <p className="text-[10px] tracking-[0.3em] text-hud-gold-dim">{scene.kicker}</p>
      )}
      <h2 className="mb-6 mt-1 border-b border-hud-border pb-3 text-xl text-hud-heading">
        {scene.title}
      </h2>

      <Narration paragraphs={paragraphs} loading={text === null} />

      {response.length > 0 && (
        <div className="mt-4 space-y-4 border-l-2 border-hud-gold/40 pl-4">
          {response.map((p, i) => (
            <p key={i} className="beat-in leading-relaxed text-hud-gold-bright/90">
              {p}
            </p>
          ))}
        </div>
      )}

      <div ref={bottomRef} className="mt-8" />

      {text !== null && it.type === "continue" && (
        <ContinueButton onClick={() => onAdvance()} />
      )}

      {text !== null && it.type === "choice" && picked === null && (
        <div className="mt-2 space-y-3">
          {it.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => {
                setPicked(opt.label);
                setResponse(opt.response);
              }}
              className="beat-in block w-full rounded-md border border-hud-border bg-hud-panel px-4 py-3 text-left text-sm leading-relaxed text-hud-text transition-colors hover:border-hud-gold/60 hover:text-hud-gold-bright"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {it.type === "choice" && picked !== null && (
        <ContinueButton onClick={() => onAdvance(picked)} />
      )}

      {text !== null && it.type === "free" && !freeSent && (
        <div className="mt-2">
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
              setResponse(it.replyFallback);
              setFreeSent(true);
            }}
            className="mt-3 text-xs text-hud-text-muted underline underline-offset-4 hover:text-hud-text"
          >
            言葉にしないで進む
          </button>
        </div>
      )}

      {it.type === "free" && freeSent && (
        <ContinueButton onClick={() => onAdvance(freeText.trim() || undefined)} />
      )}

      {text !== null && it.type === "ending" && (
        <EndingExtras onRestart={() => onAdvance()} />
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

function EndingExtras({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="mt-6 space-y-4 border-t border-hud-border pt-6">
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
