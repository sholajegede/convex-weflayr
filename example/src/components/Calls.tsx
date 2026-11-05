import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ms, num, time, usd, useScope } from "../lib/format";
import { Pill, Section, StatusBadge, Tag } from "./ui";

export function Calls() {
  const scope = useScope();
  const calls = useQuery(api.example.recentCalls, { ...scope, limit: 40 });

  return (
    <>
      <div className="hero" style={{ padding: "56px 40px 40px" }}>
        <Pill>Calls</Pill>
        <h1 style={{ fontSize: "clamp(36px, 6vw, 60px)" }}>
          Every call, <span className="mark">as it was stored</span>
        </h1>
        <p>The 40 newest calls. Cost is an estimate from the price table, unless the call reported its own.</p>
      </div>

      <Section label="Recent" title="Call log">
        {(calls ?? []).length === 0 ? (
          <div className="empty">No calls yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Customer</th>
                  <th>Call</th>
                  <th>Feature</th>
                  <th>Model</th>
                  <th className="num">Tokens in / out</th>
                  <th className="num">Cost</th>
                  <th className="num">Time taken</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {(calls ?? []).map((row) => (
                  <tr key={row._id}>
                    <td>{time(row.at)}</td>
                    <td>{row.customer}</td>
                    <td>
                      <Tag name={row.call} />
                    </td>
                    <td>
                      <Tag name={row.feature} />
                    </td>
                    <td>{row.model}</td>
                    <td className="num">
                      {num(row.inputTokens)} / {num(row.outputTokens)}
                    </td>
                    <td className="num">
                      {usd(row.costUsd)} <span className="note">{row.costSource}</span>
                    </td>
                    <td className="num">{ms(row.latencyMs)}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
