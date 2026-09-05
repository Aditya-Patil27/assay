"use client";

import { useEffect, useState } from "react";

/**
 * The ledger, replayed rather than tabled.
 *
 * public/audit/frames.json is 19 lamport-ordered messages, one per artifact the pipeline
 * wrote. Playing them back in that order rather than dumping a table means the four
 * unflagged ones land exactly where the runner actually emitted them -- last -- instead of
 * being sorted somewhere a reader would have to go looking.
 */

export interface AuditClaim {
  claim: string;
  evidence: string;
  evidence_type: "test_output" | "model_prior";
}

export interface AuditArtifact {
  ref: string;
  kind: string;
  summary: string;
  tokens: number;
}

export interface AuditMessage {
  lamport: number;
  task_status: "complete" | "uncertain";
  message_id: string;
  timestamp: string;
  git_sha: string;
  claims: AuditClaim[];
  artifacts: AuditArtifact[];
}

const STEP_MS = 350;
type Filter = "all" | "grounded" | "unflagged";

export function AuditLedger({ messages }: { messages: AuditMessage[] }) {
  const [visible, setVisible] = useState(0);
  const [entered, setEntered] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  // Replay: one more message every STEP_MS, starting on mount.
  useEffect(() => {
    if (visible >= messages.length) return;
    const t = setTimeout(() => setVisible((v) => v + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [visible, messages.length]);

  // A row is rendered opacity/translate-out first, then flipped a frame later so the
  // CSS transition actually has two states to animate between.
  useEffect(() => {
    if (visible === 0) return;
    const lamport = messages[visible - 1]?.lamport;
    if (lamport == null) return;
    const raf = requestAnimationFrame(() => {
      setEntered((prev) => new Set(prev).add(lamport));
    });
    return () => cancelAnimationFrame(raf);
  }, [visible, messages]);

  const done = visible >= messages.length;
  const hintText = done ? "replaying artifacts/ … · run complete" : "replaying artifacts/ …";

  const shown = messages.slice(0, visible).filter((m) => {
    if (filter === "grounded") return m.task_status === "complete";
    if (filter === "unflagged") return m.task_status === "uncertain";
    return true;
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="mono-label flex gap-1 text-[0.75rem]" role="group" aria-label="Filter claims">
          {(["all", "grounded", "unflagged"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-[4px] border px-3 py-1.5 transition-colors ${
                filter === f
                  ? "border-ink bg-ink text-paper"
                  : "border-rule text-muted hover:border-muted"
              }`}
            >
              {f === "all" ? "All" : f === "grounded" ? "Grounded" : "Unflagged"}
            </button>
          ))}
        </div>
        <p id="hint" className="mono-label text-[0.75rem] text-muted">
          {hintText}
        </p>
      </div>

      <div id="rows" className="flex flex-col gap-2">
        {shown.map((m) => {
          const isEntered = entered.has(m.lamport);
          const grounded = m.task_status === "complete";
          const isExpanded = expanded === m.lamport;
          return (
            <div
              key={m.lamport}
              onClick={() => setExpanded(isExpanded ? null : m.lamport)}
              className={`card cursor-pointer border border-rule p-4 transition-all duration-300 ease-out ${
                isEntered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="mono-label w-7 shrink-0 text-[0.75rem] text-muted">
                  {m.lamport}
                </span>
                <span className="mono-label flex-1 truncate text-[0.8125rem]">
                  artifacts/{m.message_id}
                </span>
                <span
                  className={`mono-label shrink-0 rounded-[4px] px-2 py-0.5 text-[0.6875rem] ${
                    grounded ? "bg-defend-fill/15 text-defend" : "bg-[#fbf0dc] text-[#9a6205]"
                  }`}
                >
                  {grounded ? "grounded" : "nothing ran"}
                </span>
                <span className="mono-label hidden shrink-0 text-[0.75rem] text-muted sm:inline">
                  {m.git_sha}
                </span>
              </div>

              <p className="mt-2 text-[0.875rem] leading-relaxed text-ink">
                {m.claims.map((c) => c.claim).join(" · ")}
              </p>

              {isExpanded && (
                <div className="mt-4 space-y-3 border-t border-rule pt-4">
                  <p
                    className={`mono-label text-[0.75rem] ${
                      grounded ? "text-defend" : "text-[#9a6205]"
                    }`}
                  >
                    {grounded ? "ran for real — grounded" : "nothing ran — not grounded"}
                  </p>
                  {m.claims.map((c, i) => (
                    <div key={i} className="text-[0.8125rem] leading-relaxed">
                      <p className="text-ink">{c.claim}</p>
                      <p className="mt-0.5 font-mono text-[0.75rem] text-muted">{c.evidence}</p>
                    </div>
                  ))}
                  {m.artifacts.map((a, i) => (
                    <p key={i} className="font-mono text-[0.75rem] text-muted">
                      {a.ref} — {a.summary}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
