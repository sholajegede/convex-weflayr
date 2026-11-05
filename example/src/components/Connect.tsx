import { useState } from "react";
import { Pill } from "./ui";

const REPO = "https://github.com/sholajegede/convex-weflayr";

export function Connect(props: { onSave: (key: string) => void }) {
  const [value, setValue] = useState("");
  const key = value.trim();

  return (
    <div className="gate">
      <Pill>convex-weflayr demo</Pill>
      <h1>
        See what every customer <span className="mark">costs you</span>
      </h1>
      <p className="gate-lead">
        convex-weflayr is a Convex component. It sends your app's model calls through the Weflayr
        gateway and saves the cost of each call, per customer, in your own database.
      </p>

      <form
        className="gate-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (key) props.onSave(key);
        }}
      >
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste your Weflayr API key to start"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button className="btn" type="submit" disabled={!key}>
          Use this key
        </button>
      </form>
      <p className="note gate-note">
        No key yet?{" "}
        <a href="https://app.weflayr.com" target="_blank" rel="noreferrer">
          Sign up for Weflayr
        </a>{" "}
        and create an API key in the dashboard. A new key just for this demo is best. The key stays
        in this browser and is never saved in the database. A test call costs about $0.00001, and
        you do not need a key from any model provider.
      </p>

      <section className="onb">
        <div className="onb-label">How it works</div>
        <div className="grid cols-4">
          <div className="cell">
            <div className="stat-label">1 · Call</div>
            <p>A Convex action calls a model through the Weflayr gateway.</p>
          </div>
          <div className="cell">
            <div className="stat-label">2 · Tag</div>
            <p>Each call says which customer, which call name and which feature it is for.</p>
          </div>
          <div className="cell">
            <div className="stat-label">3 · Save</div>
            <p>The component saves tokens, cost, time and result in Convex tables.</p>
          </div>
          <div className="cell">
            <div className="stat-label">4 · Control</div>
            <p>Your code reads the cost and stops a customer who has used their budget.</p>
          </div>
        </div>
      </section>

      <section className="onb">
        <div className="onb-label">What you can try</div>
        <div className="grid cols-2">
          <div className="cell">
            <div className="stat-label">Send calls</div>
            <p>Send one call for a customer, or run a four step agent and see the cost of each step.</p>
          </div>
          <div className="cell">
            <div className="stat-label">Customers</div>
            <p>See spend per customer, per call and per day.</p>
          </div>
          <div className="cell">
            <div className="stat-label">Budgets</div>
            <p>Set a monthly budget. When a customer reaches it, the next call is stopped.</p>
          </div>
          <div className="cell">
            <div className="stat-label">Calls</div>
            <p>Read every saved call, exactly as it is stored.</p>
          </div>
        </div>
      </section>

      <section className="onb">
        <div className="onb-label">Privacy</div>
        <div className="grid cols-2">
          <div className="cell">
            <div className="stat-label">Where your key lives</div>
            <p>
              In this browser's localStorage, and nowhere else. It is never saved in the database.
              Click Remove key at any time to delete it from this browser.
            </p>
          </div>
          <div className="cell">
            <div className="stat-label">Where your key goes</div>
            <p>
              Each call sends it over HTTPS to this demo's Convex backend. The backend uses it for
              that call, to reach Weflayr, and the code does not store or log it.
            </p>
          </div>
          <div className="cell">
            <div className="stat-label">What is saved</div>
            <p>
              Customer name, call name, feature, model, token counts, cost, time taken and result.
              No prompt or answer is saved.
            </p>
          </div>
          <div className="cell">
            <div className="stat-label">Who sees it</div>
            <p>
              Your browser gets a random id, so you only see your own calls and budgets. The calls
              also show in your own Weflayr dashboard.
            </p>
          </div>
        </div>
        <p className="note onb-note">
          Do not take our word for it. The demo code is public, so you can read exactly what it does:{" "}
          <a href={`${REPO}/blob/main/example/convex/example.ts`} target="_blank" rel="noreferrer">
            example/convex/example.ts
          </a>{" "}
          and{" "}
          <a href={`${REPO}/blob/main/example/src/lib/byok.ts`} target="_blank" rel="noreferrer">
            example/src/lib/byok.ts
          </a>
          . When you are done, delete the key in your Weflayr dashboard.
        </p>
      </section>
    </div>
  );
}
