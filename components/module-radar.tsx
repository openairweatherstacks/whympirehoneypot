const modules = [
  {
    title: "Budget Dashboard",
    status: "Live foundation",
    description: "Income, expenses, category totals, trend analysis, and raw ledger visibility are wired up now."
  },
  {
    title: "Finance Chat",
    status: "Phase 2 live",
    description: "Natural-language questions now route through a local-first finance copilot with optional Claude assistance."
  },
  {
    title: "Perk Alert Engine",
    status: "Phase 3 live",
    description: "Benefit guides can now be scanned locally and matched against real spending to surface hidden value."
  },
  {
    title: "Investment Command",
    status: "Phase 4 live",
    description: "ETF watchlists, buy signals, DCA optimization, and rebalancing guidance are now wired into the local app."
  },
  {
    title: "Deficit Crusher",
    status: "Phase 6 live",
    description: "Debt prioritization, payoff simulation, utilization warnings, and negotiation scripts are now wired into the local app."
  }
];

export function ModuleRadar() {
  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-[rgba(23,19,15,0.92)] p-6 text-white shadow-[0_24px_80px_rgba(23,19,15,0.16)]">
      <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/60">Roadmap Radar</p>
      <h2 className="mt-2 text-2xl">Phase 6 adds a real debt payoff engine to the command center</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {modules.map((module, index) => (
          <article
            key={module.title}
            className={`rounded-[1.5rem] border border-white/10 bg-white/5 p-5 ${
              index % 2 === 0 ? "float-card" : ""
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/55">
              {module.status}
            </p>
            <h3 className="mt-2 text-xl">{module.title}</h3>
            <p className="mt-3 text-sm leading-6 text-white/72">{module.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
