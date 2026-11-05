import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CALLS, TENANTS, usd, useScope } from "../lib/format";
import { Pill, Section } from "./ui";

export function Budgets(props: { apiKey: string; onLog: (title: string, detail: string) => void }) {
  const scope = useScope();
  const budgets = useQuery(api.example.budgets, scope);
  const setBudget = useAction(api.example.setBudget);
  const clearBudget = useAction(api.example.clearBudget);
  const send = useAction(api.example.sendCall);

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ customer: string; ok: boolean; text: string } | null>(null);

  async function save(customer: string) {
    const monthlyUsd = Number(inputs[customer]);
    if (!Number.isFinite(monthlyUsd) || monthlyUsd < 0) return;
    await setBudget({ visitor: scope.visitor, customer, monthlyUsd });
    props.onLog(`${customer} · budget`, `${usd(monthlyUsd)} a month`);
  }

  async function clear(customer: string) {
    await clearBudget({ visitor: scope.visitor, customer });
    props.onLog(`${customer} · budget`, "budget removed");
  }

  async function tryCall(customer: string, plan: string) {
    const answer = await send({
      apiKey: props.apiKey,
      visitor: scope.visitor,
      customer,
      plan,
      call: CALLS[0].call,
      prompt: CALLS[0].prompt,
    });
    const ok = answer.status === "ok";
    setResult({
      customer,
      ok,
      text: answer.status === "ok" ? `Sent. The call cost ${usd(answer.costUsd)}.` : answer.message,
    });
    props.onLog(
      `${customer} · test call`,
      answer.status === "blocked" ? "stopped before the model ran" : ok ? "sent" : "call failed",
    );
  }

  return (
    <>
      <div className="hero" style={{ padding: "56px 40px 40px" }}>
        <Pill>Budgets</Pill>
        <h1 style={{ fontSize: "clamp(36px, 6vw, 60px)" }}>
          Stop one customer, <span className="mark">not the app</span>
        </h1>
        <p>
          Give a customer a monthly budget in dollars. When it is used up, their next call is stopped
          before the model runs. Everyone else keeps going.
        </p>
      </div>

      <Section label={`Month ${new Date().toISOString().slice(0, 7)}`} title="Monthly budget per customer">
        <p className="note" style={{ marginTop: 0, marginBottom: 16 }}>
          One test call costs about $0.00001. Set a budget of 0.00002, then send a few calls to see
          one get stopped.
        </p>
        <div className="stack">
          {TENANTS.map((tenant) => {
            const status = budgets?.find((item) => item.customer === tenant.name);
            const limit = status?.limitUsd ?? null;
            const spent = status?.spentUsd ?? 0;
            const share = limit ? Math.min(spent / limit, 1) : 0;
            const over = limit !== null && !status?.allowed;
            return (
              <div className="card" key={tenant.name}>
                <div className="row" style={{ alignItems: "center" }}>
                  <div>
                    <h3>{tenant.name}</h3>
                    <div className="note" style={{ marginTop: 0 }}>
                      {limit === null
                        ? `No budget. ${usd(spent)} spent this month.`
                        : `${usd(spent)} of ${usd(limit)} spent`}
                    </div>
                  </div>
                  <div className="bar-row" style={{ gridTemplateColumns: "1fr", padding: 0 }}>
                    <div className={`bar${over ? " over" : " lime"}`}>
                      <span style={{ width: `${share * 100}%` }} />
                    </div>
                  </div>
                  <div className="row" style={{ flex: "none", width: 330 }}>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="USD a month"
                      value={inputs[tenant.name] ?? ""}
                      onChange={(e) => setInputs({ ...inputs, [tenant.name]: e.target.value })}
                    />
                    <button className="btn" style={{ flex: "none" }} onClick={() => save(tenant.name)}>
                      Set
                    </button>
                    <button className="btn secondary" style={{ flex: "none" }} onClick={() => clear(tenant.name)}>
                      Clear
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <button className="btn secondary" onClick={() => tryCall(tenant.name, tenant.plan)}>
                    Send a test call
                  </button>
                </div>
                {result?.customer === tenant.name && (
                  <div className={`banner ${result.ok ? "ok" : "blocked"}`}>{result.text}</div>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}
