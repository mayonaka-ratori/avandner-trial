interface NarrationProps {
  paragraphs: string[];
  /** LLM の語りを待っている間の表示 */
  loading?: boolean;
}

/** 場面の本文。段落を順番にふわっと出す */
export function Narration({ paragraphs, loading }: NarrationProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-hud-text-muted">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-hud-gold" />
        <span className="text-sm">語りを紡いでいます…</span>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className="beat-in leading-relaxed text-hud-text"
          style={{ animationDelay: `${i * 280}ms` }}
        >
          {p}
        </p>
      ))}
    </div>
  );
}
