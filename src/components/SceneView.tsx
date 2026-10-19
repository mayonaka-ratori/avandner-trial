import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, Send } from "lucide-react";
import type { ChoiceOption, ChoiceRecord, SceneDef } from "@/scenes/types";
import { narrate } from "@/api/client";
import { endingExtras } from "@/scenes/scenes";
import { Narration } from "./Narration";
import { StoryInline } from "./StoryText";
import { TEXT_SIZE_KEY, useStoredBoolean } from "@/hooks/useStoredBoolean";

interface SceneViewProps {
  scene: SceneDef;
  /** 進む。choice / free でプレイヤーが入力した内容を記録するための引数 */
  onAdvance: (record?: ChoiceRecord) => void;
  /** combat シーンで「交戦開始」が押されたとき。押すまで戦闘UIは出さない */
  onEngage?: () => void;
  /** 交戦開始済みなら true。開始ボタンを消して本文と戦闘UIを繋ぐ */
  engaged?: boolean;
  /** エンディングの総括用にこれまでの選択履歴を渡す */
  choiceLog?: ChoiceRecord[];
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
 * 本文は全文表示し、文ごとの改行と台詞の区別を共通の表示部品で行う。
 */
export function SceneView({
  scene,
  onAdvance,
  onEngage,
  engaged = false,
  choiceLog,
  battleResult,
  startedAt,
  offline = false,
}: SceneViewProps) {
  const [text, setText] = useState<string[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<ChoiceRecord | null>(null);
  const [response, setResponse] = useState<string[]>([]);
  const [responseRevealed, setResponseRevealed] = useState(false);
  const [freeSent, setFreeSent] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [busy, setBusy] = useState(false);
  const [largeText, toggleLargeText] = useStoredBoolean(TEXT_SIZE_KEY);
  const responseRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

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
      // API には構造を送らず、人が読める label だけ渡す
      choices:
        scene.id === "ending" ? choiceLog?.map((c) => c.label) : undefined,
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

  const paragraphs = text ?? [];
  // 操作の表示は「本文が出て、さらに応答文も出し切ってから」
  const ready = revealed && (response.length === 0 || responseRevealed);

  // 選択や送信の後は返事の先頭へ。本文や操作が表示されるだけでは動かさない。
  useEffect(() => {
    if (response.length === 0 || !responseRevealed) return;
    responseRef.current?.focus({ preventScroll: true });
    responseRef.current?.scrollIntoView({ block: "start" });
  }, [response, responseRevealed]);

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

  function pick(opt: ChoiceOption) {
    setPicked({ sceneId: scene.id, optionId: opt.id, label: opt.label });
    setResponseRevealed(false);
    setResponse(opt.response);
  }

  return (
    <div
      data-large-text={largeText}
      className={`scene-reader mx-auto flex w-full max-w-xl flex-col px-5 pb-8 pt-10 safe-area-bottom ${
        // combat は本文の下に戦闘UIが続くので、1画面分の空白を作らない
        it.type === "combat" ? "" : "min-h-dvh"
      }`}
    >
      {scene.alert && (
        <p className="alert-pulse mb-4 inline-block w-fit rounded border border-hud-warning/60 bg-hud-warning/10 px-3 py-1.5 font-mono-hud text-[11px] tracking-[0.25em] text-hud-warning">
          {scene.alert}
        </p>
      )}
      <div className="scene-heading">
        <h2 className="text-xl text-hud-heading">{scene.title}</h2>
        <button type="button" className="reading-size-button" aria-pressed={largeText} onClick={toggleLargeText}>
          文字を大きく
        </button>
      </div>

      <Narration
        paragraphs={paragraphs}
        loading={text === null}
        instant
        onRevealed={() => setRevealed(true)}
      />

      {response.length > 0 && (
        <div ref={responseRef} tabIndex={-1} role="region" aria-label="返事" className="story-response">
          <p className="mb-3 text-sm text-hud-text-muted">返事</p>
          <Narration
            paragraphs={response}
            instant
            onRevealed={() => setResponseRevealed(true)}
          />
        </div>
      )}

      {ready && it.type === "continue" && (
        <ContinueButton onClick={() => onAdvance()} />
      )}

      {ready && it.type === "combat" && onEngage && !engaged && (
        <ContinueButton label="ザイラに交戦する" onClick={onEngage} />
      )}

      {revealed && it.type === "choice" && picked === null && (
        <div role="group" aria-label="返答を選ぶ" className="scene-actions space-y-3">
          <p className="text-sm text-hud-text-muted">どう答えますか？</p>
          {it.options.map((opt, i) => (
            <button
              key={opt.id}
              onClick={() => pick(opt)}
              className="beat-in block w-full rounded-md border border-hud-border bg-hud-panel px-4 py-3.5 text-left text-sm leading-relaxed text-hud-text transition-colors hover:border-hud-gold/60 hover:text-hud-gold-bright"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <span className="flex items-start gap-2">
                <ChevronRight
                  size={16}
                  className="mt-0.5 shrink-0 text-hud-gold-dim"
                  aria-hidden="true"
                />
                <span><StoryInline text={opt.label} /></span>
              </span>
            </button>
          ))}
        </div>
      )}

      {ready && it.type === "choice" && picked !== null && (
        <ContinueButton onClick={() => onAdvance(picked)} />
      )}

      {revealed && it.type === "free" && !freeSent && (
        <div className="scene-actions">
          <label htmlFor={inputId} className="mb-3 block font-medium text-hud-heading">{it.prompt}</label>
          <div className="flex gap-2">
            <input
              id={inputId}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value.slice(0, 200))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) void submitFree();
              }}
              placeholder={it.placeholder}
              className="min-w-0 flex-1 rounded-md border border-hud-border bg-hud-panel px-3 py-3 text-base text-hud-text placeholder:text-hud-text-muted/70 focus:border-hud-gold/60 focus:outline-none"
            />
            <button
              onClick={submitFree}
              disabled={!freeText.trim() || busy}
              className="flex min-w-[64px] items-center justify-center gap-1.5 rounded-md border border-hud-gold/50 bg-hud-gold/20 px-4 py-3 text-sm font-medium text-hud-gold-bright transition-colors hover:bg-hud-gold/30 disabled:opacity-40"
            >
              <Send size={14} />
              {busy ? "送信中" : "言う"}
            </button>
          </div>
          <button
            onClick={() => {
              setResponseRevealed(false);
              setResponse(it.replyFallback);
              setFreeSent(true);
            }}
            className="mt-2 flex min-h-[44px] items-center text-xs text-hud-text-muted underline underline-offset-4 hover:text-hud-text"
          >
            言葉にしないで進む
          </button>
        </div>
      )}

      {ready && it.type === "free" && freeSent && (
        <ContinueButton
          onClick={() =>
            onAdvance(
              freeText.trim()
                ? { sceneId: scene.id, label: freeText.trim() }
                : undefined,
            )
          }
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

function ContinueButton({
  onClick,
  label = "つづきへ",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="mt-8 flex w-full items-center justify-center gap-1 rounded-md border border-hud-gold/50 bg-hud-gold/20 px-6 py-3.5 font-medium text-hud-gold-bright transition-colors hover:bg-hud-gold/30"
    >
      {label}
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
  choiceLog: ChoiceRecord[];
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
        <p className="mb-2 font-mono-hud text-[10px] tracking-[0.3em] text-hud-gold-dim">
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
            <dt>選択・発言の記録</dt>
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
        className="flex w-full items-center justify-center gap-1 rounded-md border border-hud-border bg-hud-panel px-6 py-3.5 text-sm text-hud-text transition-colors hover:border-hud-gold/60 hover:text-hud-gold-bright"
      >
        もう一度遊ぶ
      </button>
    </div>
  );
}
