"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const OPTIONS = [
  { value: "all", label: "Commonwealth" },
  { value: "jay", label: "Jay" },
  { value: "cicely", label: "Cicely" }
];

export function MemberFilter({ current }: { current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setMember = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all") {
        params.delete("member");
      } else {
        params.set("member", value);
      }
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-white/60 p-1 backdrop-blur">
      {OPTIONS.map((opt) => {
        const active = opt.value === current;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMember(opt.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              active
                ? opt.value === "jay"
                  ? "bg-[rgba(27,107,99,0.18)] text-[var(--brand)]"
                  : opt.value === "cicely"
                    ? "bg-[rgba(147,51,234,0.15)] text-[#7c3aed]"
                    : "bg-[var(--ink)] text-white"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
