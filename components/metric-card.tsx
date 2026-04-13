type MetricCardProps = {
  label: string;
  value: string;
  footnote: string;
  tone?: "brand" | "heat" | "neutral" | "critical";
  size?: "normal" | "hero";
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
};

const toneStyles = {
  brand: "border-[rgba(27,107,99,0.22)] bg-[rgba(27,107,99,0.09)]",
  heat: "border-[rgba(212,109,49,0.24)] bg-[rgba(212,109,49,0.1)]",
  neutral: "border-[var(--line)] bg-white/55",
  critical: "border-red-300/60 bg-red-50/80"
};

const toneValueColor = {
  brand: "text-[var(--brand)]",
  heat: "text-[var(--heat)]",
  neutral: "text-[var(--ink)]",
  critical: "text-red-600"
};

const deltaColor = {
  up: "text-[var(--heat)]",
  down: "text-[var(--brand)]",
  flat: "text-[var(--muted)]"
};

const deltaIcon = {
  up: "↑",
  down: "↓",
  flat: "→"
};

export function MetricCard({
  label,
  value,
  footnote,
  tone = "neutral",
  size = "normal",
  delta,
  deltaDirection = "flat"
}: MetricCardProps) {
  if (size === "hero") {
    return (
      <article
        className={`rounded-[2rem] border p-7 shadow-[0_24px_64px_rgba(23,19,15,0.11)] ${toneStyles[tone]}`}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.36em] text-[var(--muted)]">{label}</p>
        <p className={`mt-4 text-5xl font-bold leading-none tracking-tight ${toneValueColor[tone]}`}>{value}</p>
        {delta && (
          <p className={`mt-3 text-sm font-semibold ${deltaColor[deltaDirection]}`}>
            {deltaIcon[deltaDirection]} {delta}
          </p>
        )}
        <p className="mt-3 text-sm text-[var(--muted)]">{footnote}</p>
      </article>
    );
  }

  return (
    <article
      className={`rounded-[1.75rem] border p-5 shadow-[0_18px_48px_rgba(23,19,15,0.08)] ${toneStyles[tone]}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--muted)]">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${toneValueColor[tone]}`}>{value}</p>
      {delta && (
        <p className={`mt-1 text-xs font-semibold ${deltaColor[deltaDirection]}`}>
          {deltaIcon[deltaDirection]} {delta}
        </p>
      )}
      <p className="mt-2 text-sm text-[var(--muted)]">{footnote}</p>
    </article>
  );
}
