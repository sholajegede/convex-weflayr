import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CALLS, TENANTS, ms, usd, useScope } from "../lib/format";
import { Card, Field, Pill, Section, Tag } from "./ui";

export function Send(props: { apiKey: string; onLog: (title: string, detail: string) => void }) {
  const { visitor } = useScope();
  const send = useAction(api.example.sendCall);
  const runAgent = useAction(api.example.runAgent);

  const [customer, setCustomer] = useState<string>(TENANTS[0].name);
  const [call, setCall] = useState<string>(CALLS[0].call);
  const [prompt, setPrompt] = useState<string>(CALLS[0].prompt);
  const [busy, setBusy] = useState("");
  const [answer, setAnswer] = useState<{ ok: boolean; text: string } | null>(null);

  const [agentCustomer, setAgentCustomer] = useState<string>(TENANTS[1].name);
  const [runId, setRunId] = useState<string | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);
  const run = useQuery(api.example.runCost, runId ? { runId } : "skip");

  const plan = (name: string) => TENANTS.find((tenant) => tenant.name === name)?.plan ?? "pro";

  function pickCall(name: string) {
    setCall(name);
    setPrompt(CALLS.find((item) => item.call === name)?.prompt ?? "");
  }

  async function sendOne() {
    setBusy("one");
    setAnswer(null);
    const result = await send({
      apiKey: props.apiKey,
      visitor,
      customer,
      plan: plan(customer),
      call,
      prompt,
    });
    if (result.status === "ok") {
      setAnswer({ ok: true, text: `${result.text}\n\nCost: ${usd(result.costUsd)}` });
      props.onLog(`${customer} · ${call}`, `sent through Weflayr · ${usd(result.costUsd)}`);
    } else {
      setAnswer({ ok: false, text: result.message });
      props.onLog(`${customer} · ${call}`, result.status === "blocked" ? "stopped by the budget" : "call failed");
    }
    setBusy("");
  }

  async function agent() {
    setBusy("agent");
    setStopped(null);
    const result = await runAgent({
      apiKey: props.apiKey,
      visitor,
      customer: agentCustomer,
      plan: plan(agentCustomer),
    });
    setRunId(result.runId);
    if (result.stoppedAtStep) {
      setStopped(`Stopped at step ${result.stoppedAtStep}. ${result.message}`);
    }
    props.onLog(
      `${agentCustomer} · agent run`,
      result.stoppedAtStep ? `stopped at step ${result.stoppedAtStep}` : "all 4 steps ran",
    );
    setBusy("");
  }

  return (
    <>
      <div className="hero" style={{ padding: "56px 40px 40px" }}>
        <Pill>Send calls</Pill>
        <h1 style={{ fontSize: "clamp(36px, 6vw, 60px)" }}>
          Send a call, then <span className="mark">watch it add up</span>
        </h1>
        <p>
          Every call goes through Weflayr with your key and is saved here, under the customer you
          pick.
        </p>
      </div>

      <Section
        label="Real calls"
        title="Send one call or run an agent"
        lead="Each call is a short prompt to Claude Haiku, so it costs a fraction of a cent."
      >
        <div className="grid cols-2" style={{ background: "transparent", border: 0, gap: 16 }}>
          <Card title="Send one call" description="One prompt, one customer.">
            <div className="row">
              <Field label="Customer">
                <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
                  {TENANTS.map((tenant) => (
                    <option key={tenant.name}>{tenant.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Call name">
                <select value={call} onChange={(e) => pickCall(e.target.value)}>
                  {CALLS.map((item) => (
                    <option key={item.call}>{item.call}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Prompt">
              <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </Field>
            <button className="btn" onClick={sendOne} disabled={busy !== "" || !prompt.trim()}>
              {busy === "one" ? "Sending…" : `Send as ${customer}`}
            </button>
            {answer && (
              <div className={`banner ${answer.ok ? "ok" : "blocked"}`} style={{ whiteSpace: "pre-wrap" }}>
                {answer.text}
              </div>
            )}
          </Card>

          <Card
            title="Run an agent"
            description="Four calls with one run id: plan, search, write, verify. The budget is checked before each step."
          >
            <Field label="Customer">
              <select value={agentCustomer} onChange={(e) => setAgentCustomer(e.target.value)}>
                {TENANTS.map((tenant) => (
                  <option key={tenant.name}>{tenant.name}</option>
                ))}
              </select>
            </Field>
            <button className="btn lime" onClick={agent} disabled={busy !== ""}>
              {busy === "agent" ? "Running…" : "Run the agent"}
            </button>
            {stopped && <div className="banner blocked">{stopped}</div>}
            {run && run.steps.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="stat-label">This run cost {usd(run.costUsd)}</div>
                <table>
                  <thead>
                    <tr>
                      <th>Step</th>
                      <th className="num">Cost</th>
                      <th className="num">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.steps.map((step, index) => (
                      <tr key={index}>
                        <td>
                          <Tag name={step.call} />
                        </td>
                        <td className="num">{usd(step.costUsd)}</td>
                        <td className="num">{ms(step.latencyMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <p className="note">
          Your calls also show up in the{" "}
          <a href="https://app.weflayr.com/dashboard/" target="_blank" rel="noreferrer">
            Weflayr dashboard
          </a>
          , under each customer and feature.
        </p>
      </Section>
    </>
  );
}
