export type Member = "jay" | "cicely" | "joint";

export const MEMBERS: Member[] = ["jay", "cicely", "joint"];

export const MEMBER_LABELS: Record<Member, string> = {
  jay: "Jay",
  cicely: "Cicely",
  joint: "Joint"
};

export const MEMBER_COLORS: Record<Member, string> = {
  jay: "rgba(27,107,99,0.12)",
  cicely: "rgba(147,51,234,0.12)",
  joint: "rgba(23,19,15,0.08)"
};

export const MEMBER_TEXT: Record<Member, string> = {
  jay: "var(--brand)",
  cicely: "#7c3aed",
  joint: "var(--muted)"
};

export function isMember(val: unknown): val is Member {
  return val === "jay" || val === "cicely" || val === "joint";
}
