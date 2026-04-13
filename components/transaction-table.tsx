import { formatCurrency, formatShortDate } from "@/lib/finance";

type TransactionTableProps = {
  transactions: Array<{
    id: number;
    transactionDate: string;
    description: string;
    merchant: string;
    category: string;
    amountCents: number;
    direction: "income" | "expense";
  }>;
};

export function TransactionTable({ transactions }: TransactionTableProps) {
  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/70 p-6 shadow-[0_24px_80px_rgba(23,19,15,0.08)] backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[var(--muted)]">
            Recent Ledger
          </p>
          <h2 className="mt-2 text-2xl text-[var(--ink)]">Latest imported transactions</h2>
        </div>
        <div className="rounded-full border border-[var(--line)] bg-white/70 px-3 py-1 text-xs text-[var(--muted)]">
          12 most recent rows
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="mt-8 rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[rgba(255,255,255,0.45)] p-6 text-sm text-[var(--muted)]">
          No transactions yet. Upload a CSV with headers like <code>date,description,amount</code> to
          start.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-[var(--line)]">
          <table className="min-w-full divide-y divide-[var(--line)] text-left">
            <thead className="bg-[rgba(23,19,15,0.04)] text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] bg-white/70">
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td className="px-4 py-3 text-sm text-[var(--muted)]">
                    {formatShortDate(transaction.transactionDate)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--ink)]">{transaction.description}</p>
                    <p className="text-sm text-[var(--muted)]">{transaction.merchant}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[rgba(27,107,99,0.09)] px-3 py-1 text-xs font-medium text-[var(--brand)]">
                      {transaction.category}
                    </span>
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      transaction.direction === "income" ? "text-[var(--success)]" : "text-[var(--heat)]"
                    }`}
                  >
                    {transaction.direction === "income" ? "+" : "-"}
                    {formatCurrency(Math.abs(transaction.amountCents))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

