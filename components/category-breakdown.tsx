import { formatCurrency } from "@/lib/finance";

type CategoryBreakdownProps = {
  categories: Array<{
    category: string;
    spendCents: number;
    share: number;
  }>;
};

export function CategoryBreakdown({ categories }: CategoryBreakdownProps) {
  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">Spend Map</p>
      <h2 className="mt-2 text-2xl text-[var(--ink)]">Where the money is leaking most</h2>

      {categories.length === 0 ? (
        <div className="mt-8 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[rgba(255,255,255,0.45)] p-6 text-sm text-[var(--muted)]">
          Once expenses are imported, this panel will surface your heaviest categories first.
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {categories.map((item) => (
            <div key={item.category}>
              <div className="mb-2 flex items-center justify-between gap-4">
                <p className="font-medium text-[var(--ink)]">{item.category}</p>
                <p className="text-sm text-[var(--muted)]">{formatCurrency(item.spendCents)}</p>
              </div>
              <div className="h-3 rounded-full bg-[rgba(23,19,15,0.08)]">
                <div
                  className="h-3 rounded-full bg-gradient-to-r from-[var(--heat)] to-[var(--brand)]"
                  style={{ width: `${Math.max(item.share * 100, 8)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

