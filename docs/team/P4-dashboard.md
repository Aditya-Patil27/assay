# P4 — Dashboard & reproducibility

You own the thing judges actually look at, and the guarantee that everything still runs on a
machine that isn't ours.

**You own:** `web/`
**Don't touch:** anything under `src/` except to read it.

---

## It already builds — start by looking at it

```bash
python scripts/seed_artifacts.py
cd web && npm install && npm run dev     # localhost:3000
```

A working scaffold is committed: headline stats, framework scorecard, ASR/PR-AUC
co-evolution chart, the unrolled loop in React Flow, worked attack examples, agentic
before/after panels. It renders against seeded fixtures right now.

**Nobody has opened it in a browser yet.** That's your first task, and it may well be ugly
or broken in ways the build doesn't catch.

---

## Architecture, so you don't fight it

Static export. No backend, no API, no Python at demo time.

- `npm run sync` copies `artifacts/**.json` into `web/public/data/`
- Server components read that with `fs` **at build time** (`lib/load.ts`)
- Data is inlined into the HTML — no fetch, no loading state, no spinner in front of a judge
- `npm run build` → `web/out/` → deploy anywhere

Anything using hooks or React Flow needs `"use client"`. Data loading must stay in server
components.

`web/lib/types.ts` mirrors `src/adversarial_payments/artifacts.py`. **If you add a field on
one side, add it on the other in the same commit** — `pytest tests/test_artifacts.py` fails
otherwise, by design.

---

## Tasks, in order

### 1. Look at it, then fix what's wrong

Check in a real browser: React Flow layout (the layered positioning is naive and may
overlap), chart legibility, mobile width, contrast. Judges may open this on a phone.

### 2. The placeholder banner is a safety mechanism

Any artifact with `placeholder: true` triggers an amber banner. **Do not remove or soften
it.** It's what lets the rest of the team ship fixtures without risking a seeded number
being presented as a result. It disappears on its own as real artifacts land.

### 3. Deploy a preview today

```bash
npm run build && npx vercel deploy out --prod
```

Get a URL on Day 1, share it, redeploy as artifacts land. A link the team can watch fill in
with real numbers is worth more than a perfect local build.

If GitHub Pages instead: `BASE_PATH=/<repo-name> npm run build`.

### 4. Make the DAG the centerpiece

The unrolled loop is our best visual asset. Worth investing in:

- Round-by-round reveal, or a slider — showing round 0's attack succeeding and round 2's
  failing, *on the graph*, is the demo moment
- The dashed `unroll` edges should read clearly as the feedback cycle. Strategy §5.1 is
  emphatic that we call this an unrolled loop, not a DAG, and the visual should make the
  distinction obvious rather than rely on the caption
- Hover a node → its metrics

### 5. Reproducibility — your other job, and it's not optional

Before Day 3:

- [ ] Clone into a **fresh directory**, follow `README.md` exactly, confirm it works
- [ ] `RUN_ORCHESTRATED=0` produces the same numbers as `=1` (P2 owns the code; you own
      verifying the claim)
- [ ] `LLM_LIVE=0` runs the agentic track with no key and no network
- [ ] `npm run build` from a clean `node_modules`
- [ ] The notebook runs top to bottom on committed artifacts without training

Every one of these is a claim we make to judges. Verify each, and report honestly if one
fails rather than quietly fixing the README to avoid it.

### 6. Screenshots for P5

P5 needs stills for the deck and clean sequences for the video. Coordinate on which views
tell the story, and give them high-resolution captures rather than letting them screenshot a
laptop screen.

---

## Design notes

Palette is in `web/app/globals.css`: red = attack, teal = defend, amber = warning. The whole
story is one turning into the other, so keep that mapping consistent everywhere.

Do **not** use Mastercard's logo, colours, or branding. This is a submission to their
challenge, not a Mastercard product, and dressing it up as one reads badly.

## Done when

- [ ] Deployed URL, shared with the team
- [ ] Real artifacts wired, banner gone
- [ ] Legible on a phone
- [ ] All five reproducibility checks run and reported
- [ ] Screenshots delivered to P5
