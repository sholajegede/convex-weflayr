import type { ReactNode } from "react";
import { tagColor } from "../lib/format";

export function Pill(props: { children: ReactNode }) {
  return <span className="pill">{props.children}</span>;
}

export function Tag(props: { name: string }) {
  const { bg, fg } = tagColor(props.name);
  return (
    <span className="tag" style={{ background: bg, color: fg }}>
      {props.name}
    </span>
  );
}

export function Stat(props: { label: string; value: string; lime?: boolean }) {
  return (
    <div className="cell">
      <div className="stat-label">{props.label}</div>
      <div className={`stat-value${props.lime ? " lime" : ""}`}>{props.value}</div>
    </div>
  );
}

export function Card(props: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="card">
      <h3>{props.title}</h3>
      {props.description && <p className="card-desc">{props.description}</p>}
      {props.children}
    </div>
  );
}

export function Field(props: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{props.label}</label>
      {props.children}
    </div>
  );
}

export function StatusBadge(props: { status: "ok" | "error" | "fallback" }) {
  const tone = props.status === "ok" ? "good" : props.status === "error" ? "bad" : "warn";
  return <span className={`badge ${tone}`}>{props.status}</span>;
}

export function Section(props: {
  label: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <Pill>{props.label}</Pill>
      <h2>{props.title}</h2>
      {props.lead && <p className="lead">{props.lead}</p>}
      {props.children}
    </section>
  );
}
