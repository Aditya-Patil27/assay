"use client";

import { useEffect, useRef, useState } from "react";

import type { LiveSamples } from "@/lib/types";

/**
 * The hero, scoring real transactions in front of the reader.
 *
 * The site's problem was never that it was inaccurate -- it was that it was inert. Every
 * page rendered a run that had already finished, so the first thing a visitor met was a
 * picture of a result. This is the result happening: real rows out of the corpus, scored
 * by models/detector_round0.onnx running on WASM in this tab, at the latency /system
 * reports.
 *
 * Nothing here is simulated. The rows come from the chronological test split with their
 * true labels, the scores are the model's, and the timing is measured with
 * performance.now() on the actual forward passes -- which is why the throughput figure
 * settles near the p50 on the system page rather than at a number chosen to look good.
 */

interface Row {
  id: string;
  amt: number;
  isFraud: boolean;
  p: number;
  ms: number;
}

const TICK_MS = 420;
const VISIBLE = 7;

export function LiveScoreStream({ samples }: { samples: LiveSamples }) {
  const { threshold, features, stream } = samples;

  const [rows, setRows] = useState<Row[]>([]);
  const [scored, setScored] = useState(0);
  const [flagged, setFlagged] = useState(0);
  const [medianMs, setMedianMs] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const sessionRef = useRef<import("onnxruntime-web").InferenceSession | null>(null);
  const ortRef = useRef<typeof import("onnxruntime-web/wasm") | null>(null);
  const cursor = useRef(0);
  const timings = useRef<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ort = await import("onnxruntime-web/wasm");
        ort.env.wasm.wasmPaths = "/ort/";
        ort.env.wasm.numThreads = 1;
        const session = await ort.InferenceSession.create("/models/detector_round0.onnx", {
          executionProviders: ["wasm"],
        });
        if (cancelled) return;
        ortRef.current = ort;
        sessionRef.current = session;
        setReady(true);
      } catch {
        // The hero must never be the reason the page looks broken. If WASM will not load
        // -- an old browser, a blocked binary -- the panel quietly shows the corpus
        // instead of pretending to score it.
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !stream?.length) return;
    // Honour the reader's motion preference: a hero that animates against an explicit
    // system setting is not a good hero.
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let stopped = false;

    const scoreOne = async () => {
      const session = sessionRef.current;
      const ort = ortRef.current;
      if (!session || !ort || stopped) return;

      const txn = stream[cursor.current % stream.length];
      cursor.current += 1;

      const input = new ort.Tensor(
        "float32",
        Float32Array.from(features.map((f) => txn.values[f] ?? 0)),
        [1, features.length],
      );

      const t0 = performance.now();
      const out = await session.run({ [session.inputNames[0]]: input });
      const ms = performance.now() - t0;

      let p = Number.NaN;
      for (const name of session.outputNames) {
        const o = out[name] as unknown;
        if (Array.isArray(o) && o.length && o[0] instanceof Map) {
          const got = (o[0] as Map<number, number>).get(1);
          if (typeof got === "number") p = got;
        }
        const t = o as { data?: ArrayLike<number>; dims?: readonly number[] };
        if (Number.isNaN(p) && t?.data && t.dims && t.dims[t.dims.length - 1] === 2) {
          p = Number(t.data[1]);
        }
      }
      if (stopped) return;

      timings.current.push(ms);
      if (timings.current.length > 200) timings.current.shift();
      const sorted = [...timings.current].sort((a, b) => a - b);
      setMedianMs(sorted[Math.floor(sorted.length / 2)]);

      setRows((r) => [{ id: txn.id, amt: txn.amt, isFraud: !!txn.is_fraud, p, ms }, ...r].slice(0, VISIBLE));
      setScored((n) => n + 1);
      if (p >= threshold) setFlagged((n) => n + 1);
    };

    if (still) {
      // Reduced motion: fill the panel once and stop, so it is still a real result.
      (async () => {
        for (let i = 0; i < VISIBLE; i += 1) await scoreOne();
      })();
      return () => {
        stopped = true;
      };
    }

    void scoreOne();
    const id = setInterval(scoreOne, TICK_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [ready, stream, features, threshold]);

  const money = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="rounded-[10px] border border-night-rule bg-night-2 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 text-[0.75rem] font-medium text-night-muted">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${ready ? "animate-pulse bg-defend-fill" : "bg-night-rule"}`}
            aria-hidden="true"
          />
          {failed
            ? "Detector unavailable in this browser"
            : ready
              ? "Scoring live in your browser"
              : "Loading the detector…"}
        </p>
        <p className="tnum font-mono text-[0.6875rem] text-night-muted">
          {medianMs !== null ? `${medianMs.toFixed(3)} ms median` : "—"}
        </p>
      </div>

      <ol className="mt-4 space-y-1.5" aria-live="off">
        {rows.length === 0
          ? Array.from({ length: VISIBLE }).map((_, i) => (
              <li key={i} className="h-[30px] rounded-[5px] bg-night/60" aria-hidden="true" />
            ))
          : rows.map((r, i) => {
              const isFlagged = r.p >= threshold;
              return (
                <li
                  key={`${r.id}-${scored - i}`}
                  className="flex items-center gap-3 rounded-[5px] bg-night/60 px-2.5 py-1.5 text-[0.75rem]"
                  style={{ opacity: 1 - i * 0.11 }}
                >
                  <span className="w-[86px] shrink-0 truncate font-mono text-night-muted">
                    {r.id}
                  </span>
                  <span className="tnum w-[62px] shrink-0 text-right font-mono text-night-ink">
                    {money(r.amt)}
                  </span>
                  <span className="h-1 flex-1 overflow-hidden rounded-[2px] bg-night">
                    <span
                      className={`block h-full ${isFlagged ? "bg-attack-fill" : "bg-defend-fill"}`}
                      style={{ width: `${Math.max(r.p * 100, 2)}%` }}
                    />
                  </span>
                  <span
                    className={`tnum w-[46px] shrink-0 text-right font-mono ${isFlagged ? "text-attack-dim" : "text-night-muted"}`}
                  >
                    {r.p.toFixed(3)}
                  </span>
                  <span
                    className={`w-[52px] shrink-0 rounded-[3px] px-1.5 py-0.5 text-center text-[0.625rem] font-medium ${
                      isFlagged ? "bg-attack-fill/20 text-attack-dim" : "bg-defend-fill/15 text-defend-dim"
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
          <dd className="tnum display text-[1.25rem] text-attack-dim">{flagged}</dd>
          <dt className="text-[0.6875rem] text-night-muted">flagged</dt>
        </div>
        <div>
          <dd className="tnum display text-[1.25rem] text-defend-dim">
            {stream?.length ?? 0}
          </dd>
          <dt className="text-[0.6875rem] text-night-muted">real rows in rotation</dt>
        </div>
      </dl>

      <p className="mt-3 text-[0.6875rem] leading-relaxed text-night-muted">
        Real transactions from the held-out split, scored by the exported ONNX graph on WASM.
        No server, no mock — the timing above is measured on these forward passes.
      </p>
    </div>
  );
}
