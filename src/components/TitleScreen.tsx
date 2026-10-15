import { Swords } from "lucide-react";

interface TitleScreenProps {
  onStart: () => void;
  onResume?: () => void;
  canResume: boolean;
  offline: boolean;
}

export function TitleScreen({ onStart, onResume, canResume, offline }: TitleScreenProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-xs tracking-[0.3em] text-hud-gold-dim">
        ハイマニューバ傭兵少女TRPG
      </p>
      <h1 className="mt-3 text-3xl font-medium text-hud-heading">
        黒絢のアヴァンドナー
      </h1>
      <p className="mt-1 text-sm tracking-[0.2em] text-hud-gold">
        ― 体験版「装甲列車救援依頼」―
      </p>
      <p className="mt-8 max-w-sm text-sm leading-relaxed text-hud-text-muted">
        あなたは、今日この世界に生まれたばかりの新人アヴァンドナー。
        5〜10分で一つの物語を駆け抜けます。
      </p>
      {offline && (
        <p className="mt-4 max-w-sm text-xs leading-relaxed text-hud-copper">
          通信環境が不安定なため、簡易モードで進行します（内容は同じです）。
        </p>
      )}
      <div className="mt-10 flex flex-col items-center gap-3">
        <button
          onClick={onStart}
          className="flex items-center gap-2 rounded-md border border-hud-gold/50 bg-hud-gold/10 px-8 py-3 text-hud-gold-bright transition-colors hover:bg-hud-gold/20"
        >
          <Swords size={18} />
          物語をはじめる
        </button>
        {canResume && onResume && (
          <button
            onClick={onResume}
            className="text-sm text-hud-text-muted underline underline-offset-4 hover:text-hud-text"
          >
            途中から再開する
          </button>
        )}
      </div>
      <p className="mt-12 text-[10px] leading-relaxed text-hud-text-muted">
        『黒絢のアヴァンドナー』（著：瀧里フユ／発行：どらこにあん）
        <br />
        本アプリはイベント会場での試遊用です
      </p>
    </div>
  );
}
