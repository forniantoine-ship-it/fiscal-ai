interface QuietInsightProps {
  text: string;
}

/** Signal IA court — jamais bavard. */
export function QuietInsight({ text }: QuietInsightProps) {
  return <p className="text-[12px] text-stone-500">{text}</p>;
}
