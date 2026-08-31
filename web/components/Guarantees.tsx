import type { Guarantees as G } from "@/lib/types";

/**
 * What stops this project lying to itself.
 *
 * This replaced a module inventory -- 27 files, their line counts, and a wall of function
 * names. That answered a question nobody asks: lines of code say nothing about whether a
 * system works, and no reader can tell from "artifacts.py, 163 loc" whether a single
 * number on the site is trustworthy.
 *
 * What is actually unusual here is that the same logic exists in two languages three
 * separate times, and each pair is held equal by a check that fails loudly rather than by
 * anyone's good intentions. Each row below gives the scale of what its check covers and
 * the command to run it. Deliberately no green ticks: a hardcoded PASS on a web page is
 * exactly the kind of claim this project exists to argue against, so the reader gets the
 * command instead.
 */
export function Guarantees({ data }: { data: G }) {
  return (
    <div className="space-y-4">
      {data.guarantees.map((g, i) => (
        <section key={g.id} className="card border border-rule p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <span className="mono-label text-[0.75rem] text-attack">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="display flex-1 text-[1.25rem] md:text-[1.375rem]">{g.title}</h3>
          </div>

          <p className="prose mt-3 max-w-[74ch] text-[0.9375rem]">{g.claim}</p>

          <div className="mt-5 grid gap-4 border-t border-rule pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div>
              <p className="mono-label text-[0.6875rem] text-muted">How it is enforced</p>
              <p className="mt-1 max-w-[62ch] text-[0.8125rem] leading-relaxed text-muted">
                {g.how}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="mono-label text-[0.6875rem] text-muted">Covers</p>
              <p className="tnum mono-label mt-1 text-[0.8125rem] text-ink">{g.scale}</p>
            </div>
          </div>

          <p className="mono-label mt-4 inline-block rounded-[4px] bg-figure-2 px-2.5 py-1.5 text-[0.75rem] text-muted">
            <span className="select-none text-attack">$ </span>
            {g.command}
          </p>
        </section>
      ))}

      <p className="mono-label border-t border-rule pt-4 text-[0.8125rem] text-muted">
        <span className="text-ink">{data.tests.cases} test cases</span> across{" "}
        {data.tests.files} files, run with <span className="text-ink">{data.tests.command}</span>.
        None of the numbers above is a badge — each one is a command you can run against
        this repository.
      </p>
    </div>
  );
}
