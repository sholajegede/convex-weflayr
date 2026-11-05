import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ms, num, usd, useScope } from "../lib/format";
import { Pill, Section, Tag } from "./ui";

export function Customers() {
  const scope = useScope();
  const [selected, setSelected] = useState<string | null>(null);
  const customers = useQuery(api.example.costByCustomer, { ...scope, days: 30 });
  const calls = useQuery(api.example.costByCall, {
    ...scope,
    customer: selected ?? undefined,
    days: 30,
  });
  const days = useQuery(api.example.costByDay, {
    ...scope,
    customer: selected ?? undefined,
    days: 14,
  });
  const peak = Math.max(...(days ?? []).map((day) => day.costUsd), 0.000001);

  return (
    <>
      <div className="hero" style={{ padding: "56px 40px 40px" }}>
        <Pill>Customers</Pill>
        <h1 style={{ fontSize: "clamp(36px, 6vw, 60px)" }}>
          One row for each <span className="mark">customer</span>
        </h1>
        <p>Click a row to see which calls make up that customer's bill.</p>
      </div>

      <Section label="Last 30 days" title="Spend by customer">
        {(customers ?? []).length === 0 ? (
          <div className="empty">No calls yet. Send one from the Send calls tab.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className="num">Spend</th>
                  <th className="num">Calls</th>
                  <th className="num">Per call</th>
                  <th className="num">Tokens in / out</th>
                  <th className="num">Latency</th>
                  <th className="num">Errors</th>
                </tr>
              </thead>
              <tbody>
                {(customers ?? []).map((row) => (
                  <tr
                    key={row.customer}
                    className={`click${selected === row.customer ? " on" : ""}`}
                    onClick={() => setSelected(selected === row.customer ? null : row.customer)}
                  >
                    <td>{row.customer}</td>
                    <td className="num">{usd(row.costUsd)}</td>
                    <td className="num">{num(row.calls)}</td>
                    <td className="num">{usd(row.calls ? row.costUsd / row.calls : 0)}</td>
                    <td className="num">
                      {num(row.inputTokens)} / {num(row.outputTokens)}
                    </td>
                    <td className="num">{ms(row.averageLatencyMs)}</td>
                    <td className="num">{row.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        label={selected ?? "All customers"}
        title="Spend by call"
        lead="Every call has a name and belongs to one feature. Start your Weflayr benchmark with the call that costs the most."
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Call</th>
                <th>Feature</th>
                <th className="num">Spend</th>
                <th className="num">Calls</th>
                <th className="num">Per call</th>
                <th className="num">Latency</th>
              </tr>
            </thead>
            <tbody>
              {(calls ?? []).map((row) => (
                <tr key={row.call}>
                  <td>
                    <Tag name={row.call} />
                  </td>
                  <td>
                    <Tag name={row.feature} />
                  </td>
                  <td className="num">{usd(row.costUsd)}</td>
                  <td className="num">{num(row.calls)}</td>
                  <td className="num">{usd(row.calls ? row.costUsd / row.calls : 0)}</td>
                  <td className="num">{ms(row.averageLatencyMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <div className="stat-label">Spend per day, last 14 days</div>
          <div className="days" style={{ marginTop: 12 }}>
            {(days ?? []).map((day) => (
              <div
                key={day.day}
                title={`${day.day}: ${usd(day.costUsd)}`}
                style={{ height: `${Math.max((day.costUsd / peak) * 100, 2)}%` }}
              />
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}
