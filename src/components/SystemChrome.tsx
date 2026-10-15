/**
 * 画面全体を「アヴァンドナーの視界（機械の OS）」に見せる装飾層。
 * 格子テクスチャ・走査線・周辺減光・四隅のブラケット・上部のステータス行で
 * 構成する。すべて pointer-events: none で、操作には一切干渉しない。
 */
export function SystemChrome({ status }: { status?: string }) {
  return (
    <>
      {/* 格子＋走査線＋周辺減光 */}
      <div className="pointer-events-none fixed inset-0 z-40 hud-grid" aria-hidden="true" />
      <div className="pointer-events-none fixed inset-0 z-40 hud-scanline" aria-hidden="true" />
      <div className="pointer-events-none fixed inset-0 z-40 hud-vignette" aria-hidden="true" />

      {/* 四隅のブラケット */}
      <Corner className="left-2 top-2 border-l border-t" />
      <Corner className="right-2 top-2 border-r border-t" />
      <Corner className="bottom-2 left-2 border-b border-l" />
      <Corner className="bottom-2 right-2 border-b border-r" />

      {/* 上部ステータス行 */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between px-4 pt-1.5">
        <span className="font-mono-hud text-[9px] tracking-[0.25em] text-hud-gold-dim/80">
          AVANDNAR // GEODESIC SPHERE
        </span>
        {status && (
          <span className="font-mono-hud text-[9px] tracking-[0.25em] text-hud-gold-dim/80">
            {status}
          </span>
        )}
      </div>
    </>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <div
      className={`pointer-events-none fixed z-40 h-4 w-4 border-hud-gold-dim/50 ${className}`}
      aria-hidden="true"
    />
  );
}
