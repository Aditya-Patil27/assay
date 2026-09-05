"use client";

import { useMemo, useState } from "react";

import type { AgentRuntime, DefenseEvent, Injection, Scenario, ToolCall } from "@/lib/agent/types";

/**
 * Fire a real injection at a real model, with the defenses on or off.
 *
 * The table above this component is the measured corpus: 288 trials, already run. This is
 * the same machinery on one trial of the visitor's choosing, live -- so a judge can pick
 * the payload, flip the defenses, and watch the payee's IBAN actually change or actually
 * not. The verdict is computed by the same exploit oracle that produced the table.
 */

interface Result {
  model: string;
  defenses: string;
  exploited: boolean;
  goal: string;
  owasp_id: string;
  category: string;
  content: string;
  proposed: { name: string; arguments: Record<string, unknown> }[];
  calls: ToolCall[];
  events: DefenseEvent[];
  documentRedacted: boolean;
  cleanDocument: string;
  document: string;
  defenseMs: number;
  totalMs: number;
  payeesBefore: Record<string, { id: string; iban: string; verified: boolean }>;
  payeesAfter: Record<string, { id: string; iban: string; verified: boolean }>;
}

const LAYER_TONE: Record<string, string> = {
  classifier: "text-g5",
  tool_scope: "text-defend",
  hitl: "text-warn",
};

/**
 * The pair the panel opens on.
 *
 * Not the first entry in the corpus. Only 7 of 144 injection/scenario pairs exploit
 * `gpt-oss-120b` undefended -- the models are already largely resistant, which is itself a
 * finding -- and the first entry, io-01 on a memo scenario, is not one of them. Opening
 * there means a visitor runs both conditions, sees nothing happen in either, and concludes
 * the demo is broken rather than that the model held.
 *
 * pm-01 on sc-inv-1 is a confirmed exploit: undefended, the agent rewrites a real
 * supplier's IBAN to the attacker's, and the ledger diff shows it. Defended, the classifier
 * redacts the payload and the transfer proceeds normally. The contrast is the whole point of
 * the panel, so it is what the panel opens on.
 */
const OPENING_INJECTION = "pm-01";
const OPENING_SCENARIO = "sc-inv-1";

export function LiveAgent({ runtime }: { runtime: Pick<AgentRuntime, "scenarios" | "injections"> }) {
  const [injectionId, setInjectionId] = useState(
    runtime.injections.some((i) => i.id === OPENING_INJECTION)
      ? OPENING_INJECTION
      : (runtime.injections[0]?.id ?? ""),
  );
  const injection = runtime.injections.find((i) => i.id === injectionId) as Injection | undefined;

  // Only scenarios that read the channel this injection is planted in; firing a memo
  // payload at a dispute-review task would be measuring nothing.
  const scenarios = useMemo(
    () => runtime.scenarios.filter((s) => s.channel === injection?.channel),
    [runtime.scenarios, injection?.channel],
  );
  const [scenarioId, setScenarioId] = useState(
    scenarios.some((s) => s.id === OPENING_SCENARIO) ? OPENING_SCENARIO : (scenarios[0]?.id ?? ""),
  );
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];

  const [busy, setBusy] = useState<"on" | "off" | null>(null);
  // The planted text is editable: a judge can type their own injection against the same
  // task and the same defence stack. Reset to the preset whenever the preset changes.
  const [payload, setPayload] = useState<string>(injection?.payload ?? "");
  const [results, setResults] = useState<Record<string, Result | { error: string }>>({});

  const pick = (id: string) => {
    setInjectionId(id);
    const inj = runtime.injections.find((i) => i.id === id);
    setPayload(inj?.payload ?? "");
    const first = runtime.scenarios.find((s) => s.channel === inj?.channel);
    if (first) setScenarioId(first.id);
    setResults({});
  };

  const fire = async (defenses: boolean) => {
    if (!scenario || !injection) return;
    setBusy(defenses ? "on" : "off");
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: scenario.id, injectionId: injection.id, defenses, payload }),
      });
      const data = await res.json();
      setResults((r) => ({ ...r, [defenses ? "on" : "off"]: data }));
    } catch (e) {
      setResults((r) => ({
        ...r,
        [defenses ? "on" : "off"]: { error: e instanceof Error ? e.message : String(e) },
      }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="card border border-rule p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-[0.8125rem] font-medium">Injection</span>
            <select
              value={injectionId}
              onChange={(e) => pick(e.target.value)}
              className="mt-1.5 w-full rounded-[5px] border border-rule bg-figure px-2.5 py-2 font-mono text-[0.8125rem]"
            >
              {runtime.injections.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.id} · {i.category_title} · {i.owasp_id}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[0.8125rem] font-medium">Task the agent is doing</span>
            <select
              value={scenarioId}
              onChange={(e) => {
                setScenarioId(e.target.value);
                setResults({});
              }}
              className="mt-1.5 w-full rounded-[5px] border border-rule bg-figure px-2.5 py-2 font-mono text-[0.8125rem]"
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.task_type}
                </option>
              ))}
            </select>
          </label>
        </div>

        {injection && scenario ? (
          <div className="mt-4 space-y-3">
            <Field label={`User request (trusted)`} value={scenario.user_request} />
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[0.75rem] font-medium text-muted">
                  Planted in the {injection.channel} (untrusted) — edit it and fire your own
                </p>
                {payload.trim() !== injection.payload.trim() ? (
                  <button
                    type="button"
                    onClick={() => setPayload(injection.payload)}
                    className="text-[0.75rem] text-muted underline-offset-2 hover:underline"
                  >
                    reset to the corpus payload
                  </button>
                ) : null}
              </div>
              <textarea
                value={payload}
                maxLength={600}
                rows={3}
                onChange={(e) => {
                  setPayload(e.target.value);
                  setResults({});
                }}
                className="mt-1 w-full whitespace-pre-wrap break-words rounded-[5px] border border-attack/30 bg-attack-fill/5 px-3 py-2 font-mono text-[0.75rem] leading-relaxed"
                aria-label="Injected text"
              />
              <p className="mt-1 text-[0.6875rem] text-muted">
                {payload.length}/600 · the goal below is what the run is scored against, so a
                typed payload that tries something else will show as HELD even if the model
                obeyed it.
              </p>
            </div>
            <p className="text-[0.75rem] text-muted">
              Goal: <span className="font-mono">{injection.goal}</span> · ATLAS{" "}
              <span className="font-mono">{injection.atlas_technique}</span>
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => fire(false)}
            disabled={busy !== null}
            className="rounded-[6px] bg-attack-fill px-4 py-2.5 text-[0.875rem] font-medium text-on-accent transition-opacity disabled:opacity-40"
          >
            {busy === "off" ? "running…" : "Fire with defenses OFF"}
          </button>
          <button
            type="button"
            onClick={() => fire(true)}
            disabled={busy !== null}
            className="rounded-[6px] bg-defend-fill px-4 py-2.5 text-[0.875rem] font-medium text-on-accent transition-opacity disabled:opacity-40"
          >
            {busy === "on" ? "running…" : "Fire with defenses ON"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Outcome label="Defenses off" result={results.off} />
        <Outcome label="Defenses on" result={results.on} />
      </div>
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: "attack" }) {
  return (
    <div>
      <p className="text-[0.75rem] font-medium text-muted">{label}</p>
      <p
        className={`mt-1 whitespace-pre-wrap break-words rounded-[5px] border px-3 py-2 font-mono text-[0.75rem] leading-relaxed ${
          tone === "attack" ? "border-attack/30 bg-attack-fill/5" : "border-rule bg-figure-2"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Outcome({ label, result }: { label: string; result?: Result | { error: string } }) {
  if (!result) {
    return (
      <div className="rounded-[8px] border border-dashed border-rule p-5">
        <p className="text-[0.8125rem] font-medium text-muted">{label}</p>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
          Not run yet. Firing both is the point — a single run tells you nothing about
          whether the defense did anything.
        </p>
      </div>
    );
  }

  if ("error" in result) {
    return (
      <div className="card border border-attack/30 p-5">
        <p className="text-[0.8125rem] font-medium text-attack">{label} — failed</p>
        <p className="mt-2 font-mono text-[0.75rem] leading-relaxed text-muted">{result.error}</p>
      </div>
    );
  }

  const executed = result.calls.filter((c) => c.executed);
  const blocked = result.calls.filter((c) => c.blocked_by);
  const changed = Object.entries(result.payeesAfter).filter(
    ([id, p]) => result.payeesBefore[id]?.iban !== p.iban,
  );

  return (
    <div className="card border border-rule p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[0.8125rem] font-medium">{label}</p>
        <span
          className={`rounded-[5px] px-2 py-0.5 text-[0.75rem] font-medium text-on-accent ${
            result.exploited ? "bg-attack-fill" : "bg-defend-fill"
          }`}
        >
          {result.exploited ? "EXPLOITED" : "HELD"}
        </span>
      </div>

      <p className="mt-2 font-mono text-[0.6875rem] text-muted">
        {result.model} · {result.totalMs} ms total · {result.defenseMs} ms in defenses
      </p>

      {result.documentRedacted ? (
        <p className="mt-3 rounded-[5px] bg-g5-wash px-2.5 py-1.5 text-[0.75rem] text-g5">
          The injection filter redacted part of the document before the model saw it.
        </p>
      ) : null}

      <Section title="Tool calls the model proposed">
        {result.proposed.length === 0 ? (
          <p className="text-[0.75rem] text-muted">none — the model did not take the bait</p>
        ) : (
          <ul className="space-y-1">
            {result.proposed.map((p, i) => (
              <li key={i} className="font-mono text-[0.75rem]">
                {p.name}({JSON.stringify(p.arguments)})
              </li>
            ))}
          </ul>
        )}
      </Section>

      {blocked.length > 0 && (
        <Section title="Blocked before execution">
          <ul className="space-y-1">
            {blocked.map((c) => (
              <li key={c.seq} className="font-mono text-[0.75rem] text-defend">
                {c.tool} — {c.error}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {executed.length > 0 && (
        <Section title="Actually executed against the ledger">
          <ul className="space-y-1">
            {executed.map((c) => (
              <li key={c.seq} className="font-mono text-[0.75rem]">
                {c.tool}({JSON.stringify(c.args)})
              </li>
            ))}
          </ul>
        </Section>
      )}

      {result.events.length > 0 && (
        <Section title="Defense events">
          <ul className="space-y-1">
            {result.events.map((e, i) => (
              <li key={i} className="text-[0.75rem]">
                <span className={`font-mono font-medium ${LAYER_TONE[e.layer] ?? "text-muted"}`}>
                  {e.layer}
                </span>
                <span className="text-muted"> {e.action} — {e.detail}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Payee ledger">
        {changed.length === 0 ? (
          <p className="text-[0.75rem] text-defend">unchanged — no settlement IBAN moved</p>
        ) : (
          <ul className="space-y-1">
            {changed.map(([id, p]) => (
              <li key={id} className="font-mono text-[0.75rem] text-attack">
                {id}: {result.payeesBefore[id].iban} → {p.iban}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-rule pt-3">
      <p className="text-[0.75rem] font-medium text-muted">{title}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
