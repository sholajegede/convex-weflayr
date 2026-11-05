import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Tab } from "../App";
import { ms, num, usd, useScope } from "../lib/format";
import { Pill, Section, Stat, Tag } from "./ui";

export function Overview(props: { onTab: (tab: Tab) => void }) {
  const scope = useScope();
  const byCustomer = useQuery(api.example.costByCustomer, { ...scope, days: 30 });
  const byFeature = useQuery(api.example.costByFeature, { ...scope, days: 30 });
  const byDay = useQuery(api.example.costByDay, { ...scope, days: 14 });

  const rows = byCustomer ?? [];
  const spend = rows.reduce((sum, row) => sum + row.costUsd, 0);
  const calls = rows.reduce((sum, row) => sum + row.calls, 0);
  const latency = rows.reduce((sum, row) => sum + row.latencyMs, 0);
  const errors = rows.reduce((sum, row) => sum + row.errors, 0);
  const top = Math.max(...rows.map((row) => row.costUsd), 0.000001);
  const peak = Math.max(...(byDay ?? []).map((day) => day.costUsd), 0.000001);

  return (
    <>
      <div className="hero">
        <Pill>convex-weflayr</Pill>
        <h1>
          Know what <span className="mark">every customer</span> costs
        </h1>
        <p>
          Each model call is tagged with who it was for, then saved in your Convex database. You can
          read the cost, set limits and act on it from your own code.
        </p>
      </div>

      <div className="section">
        <div className="grid cols-4">
          <Stat label="Spend, 30 days" value={usd(spend)} lime />
          <Stat label="Calls" value={num(calls)} />
          <Stat label="Average latency" value={calls ? ms(latency / calls) : "0 ms"} />
          <Stat label="Failed calls" value={num(errors)} />
        </div>
      </div>

      <Section
        label="Cost per customer"
        title="Who is costing you what"
        lead="What each customer spent in the last 30 days. It updates as calls come in."
      >
        {rows.length === 0 ? (
          <div className="empty">
            No calls yet.{" "}
            <button className="btn secondary" onClick={() => props.onTab("send")}>
              Send a call
            </button>
          </div>
        ) : (
          <div className="card">
            {rows.map((row) => (
              <div className="bar-row" key={row.customer}>
                <span>{row.customer}</span>
                <div className="bar lime">
                  <span style={{ width: `${(row.costUsd / top) * 100}%` }} />
                </div>
                <span className="val">{usd(row.costUsd)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section label="Cost per feature" title="Which feature costs the most">
        <div className="grid cols-3">
          {(byFeature ?? []).map((row) => (
            <div className="cell" key={row.feature}>
              <Tag name={row.feature} />
              <div className="stat-value">{usd(row.costUsd)}</div>
              <div className="note">{num(row.calls)} calls</div>
            </div>
          ))}
          {(byFeature ?? []).length === 0 && <div className="cell">No calls yet.</div>}
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <div className="stat-label">Spend per day, last 14 days</div>
          <div className="days" style={{ marginTop: 12 }}>
            {(byDay ?? []).map((day) => (
              <div
                key={day.day}
                title={`${day.day}: ${usd(day.costUsd)}`}
                style={{ height: `${Math.max((day.costUsd / peak) * 100, 2)}%` }}
              />
            ))}
          </div>
        </div>
      </Section>

      <Section
        label="What you get"
        title="What it gives you"
        lead="Every call is tagged and saved in your own Convex tables."
      >
        <div className="grid cols-3">
          <div className="cell">
            <div className="stat-label">Know</div>
            <p>Cost by customer, call, feature and day. Your app can show it live.</p>
          </div>
          <div className="cell">
            <div className="stat-label">Limit</div>
            <p>
              Give each customer a monthly budget. Their next call is stopped before the model runs.
              Other customers carry on.
            </p>
          </div>
          <div className="cell">
            <div className="stat-label">Improve</div>
            <p>
              Each call has a fixed name, so Weflayr can replay your real calls on cheaper models and
              score the answers.
            </p>
          </div>
          <div className="cell">
            <div className="stat-label">Agents</div>
            <p>
              Every step of an agent run shares one id. You see what the run cost, step by step, and
              can stop it part way.
            </p>
          </div>
          <div className="cell">
            <div className="stat-label">Stay up</div>
            <p>
              If the gateway fails, <code>withFallback</code> can run the call direct, so your
              customer still gets an answer.
            </p>
          </div>
          <div className="cell">
            <div className="stat-label">Yours</div>
            <p>The numbers live in your own tables, so your code can use them.</p>
          </div>
        </div>
      </Section>
    </>
  );
}
