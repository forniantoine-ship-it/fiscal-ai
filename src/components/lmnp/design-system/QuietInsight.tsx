interface QuietInsightProps {
  text: string;
}

/** Signal IA court — jamais bavard. */
export function QuietInsight({ text }: QuietInsightProps) {
  return <p className="text-[12px] text-ink-muted">{text}</p>;
}
