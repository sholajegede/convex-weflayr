import { useMemo } from "react";
import { visitorId } from "./byok";

export function usd(value: number): string {
  if (value === 0) return "$0.00";
  if (Math.abs(value) < 0.01) return `$${value.toFixed(6).replace(/0+$/, "")}`;
  return `$${value.toFixed(2)}`;
}

export function ms(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}

export function num(value: number): string {
  return value.toLocaleString();
}

export function time(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour12: false });
}

/** Demo workspaces. Each one is a customer the app pays model costs for. */
export const TENANTS = [
  { name: "Plausible", plan: "pro" },
  { name: "Cal.com", plan: "pro" },
  { name: "Resend", plan: "team" },
  { name: "Clerk", plan: "team" },
] as const;

const TENANT_NAMES: string[] = TENANTS.map((tenant) => tenant.name);

/** The call names the demo sends, each with a short prompt. */
export const CALLS = [
  {
    call: "classify-ticket",
    prompt:
      "Classify this support ticket as billing, bug or question. Answer with one word: I was charged twice for my March invoice.",
  },
  {
    call: "draft-reply",
    prompt:
      "Write a two sentence reply to a customer who says their March invoice was charged twice.",
  },
  {
    call: "summarise-thread",
    prompt:
      "Summarise in one sentence: the customer says the export fails on large files. Support asks for the file size. The customer says about 200 MB. Support says the limit is 100 MB.",
  },
] as const;

/** The id of this browser and the customer names, passed to every query. */
export function useScope() {
  const visitor = useMemo(() => visitorId(), []);
  return useMemo(() => ({ visitor, customers: TENANT_NAMES }), [visitor]);
}

const TAGS = ["#FF8A2B", "#A9A8F5", "#2EDC74", "#FFC2BD", "#FF4FA3", "#1B3BFF"];

/** A stable colour for a call or feature name, the way the Brik tool tags are coloured. */
export function tagColor(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const bg = TAGS[hash % TAGS.length];
  return { bg, fg: bg === "#1B3BFF" || bg === "#FF4FA3" ? "#fff" : "#0A0A0A" };
}
