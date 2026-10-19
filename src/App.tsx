import { useCallback, useEffect, useRef, useState } from "react";
import { checkStatus } from "@/api/client";
import { FIRST_SCENE, getScene } from "@/scenes/scenes";
import type { ChoiceRecord } from "@/scenes/types";
import { TitleScreen } from "@/components/TitleScreen";
import { SceneView } from "@/components/SceneView";
import { BattleView } from "@/components/BattleView";
import { BootSequence } from "@/components/BootSequence";
import { SystemChrome } from "@/components/SystemChrome";
import { createCombat } from "@/engine/combat";
import { readBattleSave, type BattleSave } from "@/engine/battleSave";

type Phase = "checking" | "title" | "boot" | "playing" | "closed";

interface PlayState {
  sceneId: string;
  choiceLog: ChoiceRecord[];
  battleResult: "won" | "lost-then-won";
  /** 体験開始時刻（エンディングの経過時間表示用） */
  startedAt: number;
  battle?: BattleSave;
}

// 英語表記を直しても、保存済みの続きから遊べるよう内部名は変えない。
const SAVE_KEY = "avandnar-trial-save";

/** choiceLog の1要素を ChoiceRecord に正規化する。変換できなければ null */
function toChoiceRecord(c: unknown): ChoiceRecord | null {
  // 旧形式（素の文字列）は sceneId 不明のまま label だけ拾う
  if (typeof c === "string") return { sceneId: "", label: c };
  if (c === null || typeof c !== "object") return null;
  const rec = c as Partial<ChoiceRecord>;
  if (typeof rec.sceneId !== "string" || typeof rec.label !== "string") {
    return null;
  }
  return {
    sceneId: rec.sceneId,
    label: rec.label,
    ...(typeof rec.optionId === "string" ? { optionId: rec.optionId } : {}),
  };
}

function loadSave(): PlayState | null {
  try {
    const raw = sessionStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PlayState;
    if (typeof data.sceneId !== "string") return null;
    getScene(data.sceneId); // 存在しないシーンなら捨てる
    return {
      sceneId: data.sceneId,
      choiceLog: Array.isArray(data.choiceLog)
        ? data.choiceLog.flatMap((c) => {
            const rec = toChoiceRecord(c);
            return rec ? [rec] : [];
          })
        : [],
      battleResult: data.battleResult === "lost-then-won" ? "lost-then-won" : "won",
      startedAt: typeof data.startedAt === "number" ? data.startedAt : Date.now(),
      battle: data.sceneId === "insertion" ? readBattleSave(data.battle) : undefined,
    };
  } catch {
    return null;
  }
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [offline, setOffline] = useState(false);
  const [play, setPlay] = useState<PlayState>({
    sceneId: FIRST_SCENE,
    choiceLog: [],
    battleResult: "won",
    startedAt: Date.now(),
  });
  const [saved, setSaved] = useState<PlayState | null>(null);
  const engaged = play.battle !== undefined;
  const battleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    checkStatus().then((status) => {
      if (cancelled) return;
      if (status === "closed") {
        setPhase("closed");
      } else {
        setOffline(status === "error");
        setSaved(loadSave());
        setPhase("title");
      }
    });
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback((p: PlayState) => {
    try {
      sessionStorage.setItem(SAVE_KEY, JSON.stringify(p));
    } catch {
      // 保存に失敗しても遊び続けられるので黙って捨てる
    }
  }, []);

  const start = useCallback(() => {
    const fresh = {
      sceneId: FIRST_SCENE,
      choiceLog: [],
      battleResult: "won" as const,
      startedAt: Date.now(),
    };
    setPlay(fresh);
    persist(fresh);
    setPhase("boot");
  }, [persist]);

  const resume = useCallback(() => {
    if (!saved) return;
    setPlay(saved);
    setPhase("playing");
  }, [saved]);

  const advance = useCallback(
    (nextSceneId: string, record?: ChoiceRecord) => {
      setPlay((prev) => {
        const next = {
          ...prev,
          sceneId: nextSceneId,
          choiceLog: record ? [...prev.choiceLog, record] : prev.choiceLog,
          battle: undefined,
        };
        persist(next);
        return next;
      });
      window.scrollTo({ top: 0 });
    },
    [persist],
  );

  const saveBattle = useCallback((battle: BattleSave) => {
    setPlay((prev) => {
      const next = { ...prev, battle };
      persist(next);
      return next;
    });
  }, [persist]);

  // 交戦を始めたら物語を片づけ、戦闘画面の先頭に移る。
  useEffect(() => {
    if (engaged) {
      window.scrollTo({ top: 0 });
      battleRef.current?.focus({ preventScroll: true });
    }
  }, [engaged]);

  if (phase === "checking") {
    return (
      <>
        <SystemChrome />
        <div className="flex min-h-dvh items-center justify-center text-hud-text-muted">
          <span className="font-mono-hud text-xs tracking-[0.2em]">
            INITIALIZING…
          </span>
        </div>
      </>
    );
  }

  if (phase === "closed") {
    return (
      <>
        <SystemChrome status="LINK CLOSED" />
        <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl text-hud-heading">黒絢のアヴァンドナー</h1>
          <p className="mt-1 text-sm tracking-[0.2em] text-hud-gold">― 体験版 ―</p>
          <p className="mt-8 text-sm leading-relaxed text-hud-text-muted">
            この体験版はイベント会場限定です。
            <br />
            会期中でしたら、通信環境をご確認のうえもう一度お試しください。
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-8 rounded-md border border-hud-border bg-hud-panel px-8 py-3.5 text-sm text-hud-text hover:border-hud-gold/60"
          >
            再読み込み
          </button>
        </div>
      </>
    );
  }

  if (phase === "title") {
    return (
      <>
        <SystemChrome />
        <TitleScreen
          onStart={start}
          onResume={resume}
          // エンディングは「もう一度遊ぶ」しかないので再開対象から外す
          canResume={
            saved !== null &&
            saved.sceneId !== FIRST_SCENE &&
            saved.sceneId !== "ending"
          }
          offline={offline}
        />
      </>
    );
  }

  if (phase === "boot") {
    return (
      <>
        <SystemChrome status="BOOT" />
        <BootSequence onDone={() => setPhase("playing")} />
      </>
    );
  }

  const scene = getScene(play.sceneId);

  return (
    <main className="min-h-dvh">
      <SystemChrome status={engaged ? "交戦中" : scene.kicker ?? undefined} reading />
      <div key={scene.id} className="scene-in">
        {!engaged && <SceneView
          scene={scene}
          offline={offline}
          choiceLog={play.choiceLog}
          battleResult={play.battleResult}
          startedAt={play.startedAt}
          onEngage={() => saveBattle({ version: 1, state: createCombat(), lostCount: 0, eventStart: 0 })}
          engaged={engaged}
          onAdvance={(record) => {
            if (scene.interaction.type === "ending") {
              // 「もう一度遊ぶ」
              try {
                sessionStorage.removeItem(SAVE_KEY);
              } catch {
                // 消せなくてもよい
              }
              setSaved(null);
              setPhase("title");
              return;
            }
            if (scene.next) advance(scene.next, record);
          }}
        />}
        {scene.interaction.type === "combat" && engaged && (
          <div
            ref={battleRef}
            tabIndex={-1}
            className="battle-root"
          >
            <BattleView
              initialSave={play.battle}
              onSave={saveBattle}
              onEnd={(result) => {
                setPlay((prev) => {
                  const next = { ...prev, sceneId: "ending", battle: undefined, battleResult: result };
                  persist(next);
                  return next;
                });
                window.scrollTo({ top: 0 });
              }}
            />
          </div>
        )}
      </div>
    </main>
  );
}
