/** Small presentational primitives shared across the page. */

export function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-t border-line px-6 py-14 md:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
        {lede ? <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{lede}</p> : null}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-panel p-5 ${className}`}>{children}</div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "attack" | "defend";
}) {
  const toneClass =
    tone === "attack" ? "text-attack" : tone === "defend" ? "text-defend" : "text-text";
  return (
    <Panel>
      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted">{label}</p>
      <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </Panel>
  );
}

export function PlaceholderBanner({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return (
    <div className="border-b border-warn/40 bg-warn/10 px-6 py-3 md:px-10">
      <p className="mx-auto max-w-6xl font-mono text-xs text-warn">
        PLACEHOLDER DATA — these figures are seeded fixtures, not pipeline output. The banner
        clears when the writers emit <span className="font-semibold">placeholder=false</span>.
      </p>
    </div>
  );
}
