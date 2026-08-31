"use client";

import { useEffect, useRef, useState } from "react";

import { scoreRow, type TreeModel } from "@/lib/trees";
import type { LiveSamples } from "@/lib/types";

/**
 * The hero, scoring real transactions in front of the reader.
 *
 * The site's problem was never accuracy, it was that it was inert: every route rendered a
 * run that had already finished, so the first thing a visitor met was a picture of a
 * result. This is the result happening -- real rows from the held-out split, scored by the
 * trained detector, in this tab.
 *
 * It used to load onnxruntime-web to do this, which meant 3.2MB of WASM on the wire before
 * the landing page could show anything. The model is 400 boosted trees; lib/trees.ts walks
 * them directly in 174KB, synchronously, and check_tree_port.py proves the answers are the
 * ONNX graph's to within 1.7e-7.
 */

interface Row {
  id: string;
  amt: number;
  isFraud: boolean;
  p: number;
}

const TICK_MS = 420;
const VISIBLE = 7;

//: sessionStorage, not localStorage: the tally belongs to this visit. A counter
//: resuming at four thousand a week later would be a stranger claim than restarting.
const TALLY_KEY = "aps.livescore.tally";

export function LiveScoreStream({ samples }: { samples: LiveSamples }) {
  const { threshold, stream } = samples;

  const [model, setModel] = useState<TreeModel | null>(null);
  const [failed, setFailed] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [scored, setScored] = useState(0);
  const [flagged, setFlagged] = useState(0);
  const [medianUs, setMedianUs] = useState<number | null>(null);

  const cursor = useRef(0);
  const timings = useRef<number[]>([]);

  // Carry the tally across navigation. Next unmounts this component when the visitor
  // opens another page, so without this the counter restarts at zero every time they come
  // back -- which reads as "nothing was really running" rather than as a live meter. The
  // scores themselves are recomputed either way; only the running total is restored.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(TALLY_KEY);
      if (!saved) return;
      const t = JSON.parse(saved) as { scored: number; flagged: number; cursor: number };
      if (typeof t.scored !== "number" || typeof t.flagged !== "number") return;
      setScored(t.scored);
      setFlagged(t.flagged);
      // Resume the rotation where it stopped, so returning does not replay the same rows.
      cursor.current = typeof t.cursor === "number" ? t.cursor : 0;
    } catch {
      // Private windows and blocked site data throw on access. A missing tally is not a
      // reason for the hero to fail, so start from zero and carry on.
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        TALLY_KEY,
        JSON.stringify({ scored, flagged, cursor: cursor.current }),
      );
    } catch {
      /* see above */
    }
  }, [scored, flagged]);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/detector_trees.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!cancelled) setModel(d.payload as TreeModel);
      })
      .catch(() => {
        // The hero must never be why the page looks broken.
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!model || !stream?.length) return;

    const tick = () => {
      const txn = stream[cursor.current % stream.length];
      cursor.current += 1;

      const t0 = performance.now();
      const p = scoreRow(model, txn.values);
      const us = (performance.now() - t0) * 1000;

      timings.current.push(us);
      if (timings.current.length > 200) timings.current.shift();
      const sorted = [...timings.current].sort((a, b) => a - b);
      setMedianUs(sorted[Math.floor(sorted.length / 2)]);

      setRows((r) =>
        [{ id: txn.id, amt: txn.amt, isFraud: !!txn.is_fraud, p }, ...r].slice(0, VISIBLE),
      );
      setScored((n) => n + 1);
      if (p >= threshold) setFlagged((n) => n + 1);
    };

    // Honour the reader's motion preference: fill once and hold, still a real result.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      for (let i = 0; i < VISIBLE; i += 1) tick();
      return;
    }

    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [model, stream, threshold]);

  const money = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="rounded-[10px] border border-night-rule bg-night-2 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 text-[0.75rem] font-medium text-night-muted">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${model ? "animate-pulse bg-defend-fill" : "bg-night-rule"}`}
            aria-hidden="true"
          />
          {failed ? "Detector unavailable" : model ? "Scoring live in your browser" : "Loading…"}
        </p>
        <p className="tnum font-mono text-[0.6875rem] text-night-muted">
          {medianUs !== null ? `${medianUs.toFixed(0)} µs median` : "—"}
        </p>
      </div>

      <ol className="mt-4 space-y-1.5">
        {rows.length === 0
          ? Array.from({ length: VISIBLE }).map((_, i) => (
              <li key={i} className="h-[30px] rounded-[5px] bg-figure-2" aria-hidden="true" />
            ))
          : rows.map((r, i) => {
              const isFlagged = r.p >= threshold;
              return (
                <li
                  key={`${r.id}-${scored - i}`}
                  className="flex items-center gap-3 rounded-[5px] bg-figure-2 px-2.5 py-1.5 text-[0.75rem]"
                  style={{ opacity: 1 - i * 0.11 }}
                >
                  <span className="w-[86px] shrink-0 truncate font-mono text-night-muted">
                    {r.id}
                  </span>
                  <span className="tnum w-[62px] shrink-0 text-right font-mono text-night-ink">
                    {money(r.amt)}
                  </span>
                  <span className="h-1 flex-1 overflow-hidden rounded-[2px] bg-rule">
                    <span
                      className={`block h-full ${isFlagged ? "bg-attack-fill" : "bg-defend-fill"}`}
                      style={{ width: `${Math.max(r.p * 100, 2)}%` }}
                    />
                  </span>
                  <span
                    className={`tnum w-[46px] shrink-0 text-right font-mono ${isFlagged ? "text-attack" : "text-muted"}`}
                  >
                    {r.p.toFixed(3)}
                  </span>
                  <span
                    className={`w-[52px] shrink-0 rounded-[3px] px-1.5 py-0.5 text-center text-[0.625rem] font-medium ${
                      isFlagged
                        ? "bg-attack-fill/20 text-attack"
                        : "bg-defend-fill/15 text-defend"
                    }`}
                  >
                    {isFlagged ? "FLAG" : "PASS"}
                  </span>
                </li>
              );
            })}
      </ol>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-night-rule pt-4">
        <div>
          <dd className="tnum display text-[1.25rem] text-night-ink">{scored}</dd>
          <dt className="text-[0.6875rem] text-night-muted">scored</dt>
        </div>
        <div>
          <dd className="tnum display text-[1.25rem] text-attack">{flagged}</dd>
          <dt className="text-[0.6875rem] text-night-muted">flagged</dt>
        </div>
        <div>
          <dd className="tnum display text-[1.25rem] text-defend">{stream?.length ?? 0}</dd>
          <dt className="text-[0.6875rem] text-night-muted">real rows in rotation</dt>
        </div>
      </dl>

      <p className="mt-3 text-[0.6875rem] leading-relaxed text-night-muted">
        Real transactions from the held-out split, scored by the trained detector walking its
        own 400 trees — no server and no inference runtime. Timing measured on these calls.
      </p>
    </div>
  );
}
