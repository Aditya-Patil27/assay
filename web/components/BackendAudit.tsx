import type { BackendAudit as Audit } from "@/lib/types";

/**
 * The backend, audited on the frontend.
 *
 * Every other page renders the pipeline's *output*, which asks a reader to take on faith
 * that anything produced it. This renders the pipeline itself: each module, its size, the
 * first sentence of its own docstring, and its public API -- walked out of the source by
 * scripts/export_backend_audit.py with `ast`, never typed by hand. A hand-written module
 * list is wrong the first time somebody adds a file, and a stale inventory is worse than
 * no inventory when the whole point is that the numbers can be checked.
 */

/** Eight group colours, assigned by position so a new group gets one automatically. */
const RAMP = ["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8"] as const;

export function BackendAudit({ audit }: { audit: Audit }) {
  const { groups, tests, scripts, totals } = audit;
  const widest = Math.max(...groups.map((g) => g.modules.reduce((n, m) => n + m.loc, 0)), 1);

  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-5">
        {[
          { k: "Modules", v: totals.modules.toLocaleString("en-US") },
          { k: "Lines of code", v: totals.loc.toLocaleString("en-US") },
          { k: "Test files", v: totals.test_files.toLocaleString("en-US") },
          { k: "Test cases", v: totals.test_cases.toLocaleString("en-US") },
          { k: "Scripts", v: totals.scripts.toLocaleString("en-US") },
        ].map((s) => (
          <div key={s.k} className="bg-figure px-4 py-4">
            <dt className="text-[0.75rem] text-muted">{s.k}</dt>
            <dd className="tnum display mt-1 text-[1.625rem] leading-none">{s.v}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-4">
        {groups.map((g, i) => {
          const c = RAMP[i % RAMP.length];
          const loc = g.modules.reduce((n, m) => n + m.loc, 0);
          return (
            <section key={g.key} className="card border border-rule">
              <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-rule px-5 py-4">
                <span
                  className="rounded-[5px] px-2 py-0.5 text-[0.75rem] font-medium"
                  style={{ background: `var(--color-${c}-wash)`, color: `var(--color-${c})` }}
                >
                  {g.title}
                </span>
                <p className="min-w-[16rem] flex-1 text-[0.8125rem] text-muted">{g.blurb}</p>
                <span className="tnum shrink-0 font-mono text-[0.75rem] text-muted">
                  {g.modules.length} modules · {loc.toLocaleString("en-US")} loc
                </span>
              </header>

              {/* Proportional bar: how much of the backend this group actually is. A list
                  of module names gives no sense of weight; this does, at no extra claim. */}
              <div className="h-1 w-full bg-figure-2">
                <div
                  className="h-full"
                  style={{ width: `${(loc / widest) * 100}%`, background: `var(--color-${c})` }}
                />
              </div>

              <ul className="divide-y divide-rule">
                {g.modules.map((m) => (
                  <li key={m.path} className="px-5 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <code className="font-mono text-[0.8125rem] font-medium">{m.path}</code>
                      <span className="tnum shrink-0 font-mono text-[0.75rem] text-muted">
                        {m.loc.toLocaleString("en-US")} loc
                      </span>
                    </div>
                    {m.summary ? (
                      <p className="mt-1.5 max-w-[80ch] text-[0.8125rem] leading-relaxed text-muted">
                        {m.summary}
                      </p>
                    ) : null}
                    {m.api.length > 0 ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {m.api.map((name) => (
                          <code
                            key={name}
                            className="rounded-[4px] border border-rule bg-figure-2 px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted"
                          >
                            {name}
                          </code>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card border border-rule">
          <h3 className="border-b border-rule px-5 py-3.5 text-[0.875rem] font-medium">
            Tests
            <span className="tnum ml-2 font-mono text-[0.75rem] font-normal text-muted">
              {totals.test_cases} cases across {totals.test_files} files
            </span>
          </h3>
          <ul className="divide-y divide-rule">
            {tests.map((t) => (
              <li key={t.path} className="px-5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <code className="font-mono text-[0.8125rem]">{t.path}</code>
                  <span className="tnum shrink-0 font-mono text-[0.75rem] text-muted">
                    {t.cases} cases
                  </span>
                </div>
                {t.summary ? (
                  <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">{t.summary}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="card border border-rule">
          <h3 className="border-b border-rule px-5 py-3.5 text-[0.875rem] font-medium">
            Entry points
            <span className="ml-2 font-mono text-[0.75rem] font-normal text-muted">
              runnable scripts
            </span>
          </h3>
          <ul className="divide-y divide-rule">
            {scripts.map((s) => (
              <li key={s.path} className="px-5 py-3">
                <code className="font-mono text-[0.8125rem]">{s.path}</code>
                {s.summary ? (
                  <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">{s.summary}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
