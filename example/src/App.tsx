import { useCallback, useState } from "react";
import "./theme.css";
import { Overview } from "./components/Overview";
import { Send } from "./components/Send";
import { Customers } from "./components/Customers";
import { Budgets } from "./components/Budgets";
import { Calls } from "./components/Calls";
import { Connect } from "./components/Connect";
import { readKey, removeKey, saveKey } from "./lib/byok";
import { readLog, writeLog } from "./lib/session";

export type Tab = "overview" | "send" | "customers" | "budgets" | "calls";
export type LogLine = { id: number; title: string; detail: string };

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "send", label: "Send calls" },
  { id: "customers", label: "Customers" },
  { id: "budgets", label: "Budgets" },
  { id: "calls", label: "Calls" },
];

export default function App() {
  const [apiKey, setApiKey] = useState<string | null>(() => readKey());
  const [tab, setTab] = useState<Tab>("overview");
  const [log, setLog] = useState<LogLine[]>(() => readLog());
  const onLog = useCallback((title: string, detail: string) => {
    setLog((lines) => {
      const next = [{ id: Date.now() + Math.random(), title, detail }, ...lines].slice(0, 12);
      writeLog(next);
      return next;
    });
  }, []);

  if (!apiKey) {
    return (
      <div className="shell">
        <div className="main">
          <Connect
            onSave={(key) => {
              saveKey(key);
              setApiKey(key);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="main">
        <header className="topbar">
          <div className="logo">convex-weflayr</div>
          <nav className="nav">
            {TABS.map((item) => (
              <button
                key={item.id}
                className={tab === item.id ? "active" : ""}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="topbar-end">
            <button className="cta" onClick={() => setTab("send")}>
              Send a call
            </button>
          </div>
        </header>

        {tab === "overview" && <Overview onTab={setTab} />}
        {tab === "send" && <Send apiKey={apiKey} onLog={onLog} />}
        {tab === "customers" && <Customers />}
        {tab === "budgets" && <Budgets apiKey={apiKey} onLog={onLog} />}
        {tab === "calls" && <Calls />}
      </div>

      <aside className="rail">
        <h4>Your key</h4>
        <div className="line">
          Saved in this browser only.
          <br />
          <button
            className="btn secondary"
            style={{ marginTop: 8 }}
            onClick={() => {
              removeKey();
              writeLog([]);
              setLog([]);
              setApiKey(null);
            }}
          >
            Remove key
          </button>
        </div>
        <h4 style={{ marginTop: 28 }}>This session</h4>
        {log.length === 0 && <div className="line">Nothing sent yet.</div>}
        {log.map((line) => (
          <div className="line" key={line.id}>
            <b>{line.title}</b>
            <br />
            {line.detail}
          </div>
        ))}
      </aside>
    </div>
  );
}
