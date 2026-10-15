import { useCallback, useEffect, useState } from "react";
import { checkStatus } from "@/api/client";
import { FIRST_SCENE, getScene } from "@/scenes/scenes";
import { TitleScreen } from "@/components/TitleScreen";
import { SceneView } from "@/components/SceneView";
import { BattleView } from "@/components/BattleView";

type Phase = "checking" | "title" | "playing" | "closed";

interface PlayState {
  sceneId: string;
  choiceLog: string[];
  battleResult: "won" | "lost-then-won";
}

const SAVE_KEY = "avandnar-trial-save";

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
        ? data.choiceLog.filter((c): c is string => typeof c === "string")
        : [],
      battleResult: data.battleResult === "lost-then-won" ? "lost-then-won" : "won",
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
  });
  const [saved, setSaved] = useState<PlayState | null>(null);

  useEffect(() => {
    checkStatus().then((status) => {
      if (status === "closed") {
        setPhase("closed");
      } else {
        setOffline(status === "error");
        setSaved(loadSave());
        setPhase("title");
      }
    });
  }, []);

  const persist = useCallback((p: PlayState) => {
    try {
      sessionStorage.setItem(SAVE_KEY, JSON.stringify(p));
    } catch {
      // 保存に失敗しても遊び続けられるので黙って捨てる
    }
  }, []);

  const start = useCallback(() => {
    const fresh = { sceneId: FIRST_SCENE, choiceLog: [], battleResult: "won" as const };
    setPlay(fresh);
    persist(fresh);
    setPhase("playing");
  }, [persist]);

  const resume = useCallback(() => {
    if (!saved) return;
    setPlay(saved);
    setPhase("playing");
  }, [saved]);

  const advance = useCallback(
    (nextSceneId: string, record?: string) => {
      setPlay((prev) => {
        const next = {
          ...prev,
          sceneId: nextSceneId,
          choiceLog: record ? [...prev.choiceLog, record] : prev.choiceLog,
        };
        persist(next);
        return next;
      });
      window.scrollTo({ top: 0 });
    },
    [persist],
  );

  if (phase === "checking") {
    return (
      <div className="flex min-h-dvh items-center justify-center text-hud-text-muted">
        <span className="text-sm">読み込んでいます…</span>
      </div>
    );
  }

  if (phase === "closed") {
    return (
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
          className="mt-8 rounded-md border border-hud-border bg-hud-panel px-6 py-2.5 text-sm text-hud-text hover:border-hud-gold/60"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (phase === "title") {
    return (
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
    );
  }

  const scene = getScene(play.sceneId);

  return (
    <main className="min-h-dvh">
      <SceneView
        key={scene.id}
        scene={scene}
        offline={offline}
        choiceLog={play.choiceLog}
        battleResult={play.battleResult}
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
      />
      {scene.interaction.type === "combat" && (
        <div className="mx-auto w-full max-w-xl px-5 pb-8 safe-area-bottom">
          <BattleView
            onEnd={(result) => {
              setPlay((prev) => {
                const next = { ...prev, battleResult: result };
                persist(next);
                return next;
              });
              advance("ending");
            }}
          />
        </div>
      )}
    </main>
  );
}
