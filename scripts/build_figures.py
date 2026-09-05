"""Render the writeup's figures from the committed artifacts.

Every figure in docs/submission/writeup.tex is generated here, from artifacts/*.json, at
build time. None of them is a screenshot and none carries a number typed by hand -- if a
run changes an artifact, re-running this changes the figure, and a caption that no longer
matches its own data is a bug rather than a stale image nobody noticed.

    python scripts/build_figures.py

Writes docs/submission/figures/*.pdf (vector, for LaTeX).
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

from adversarial_payments.config import ARTIFACTS, ROOT

OUT = ROOT / "docs" / "submission" / "figures"

# The site's palette, on white. Coral is the attacker, teal the defence -- the same
# mapping the dashboard uses, so a reader moving between them is not relearning colours.
ATTACK = "#c9372b"
DEFEND = "#007b9a"
MUTED = "#6b6558"
RULE = "#d6cdb8"
INK = "#17150f"


def style() -> None:
    plt.rcParams.update(
        {
            "figure.dpi": 150,
            "savefig.bbox": "tight",
            "font.size": 9,
            "axes.edgecolor": MUTED,
            "axes.labelcolor": INK,
            "axes.titlesize": 10,
            "axes.titleweight": "medium",
            "text.color": INK,
            "xtick.color": MUTED,
            "ytick.color": MUTED,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "grid.color": RULE,
            "grid.linewidth": 0.6,
        }
    )


def load(*parts: str):
    d = json.loads((ARTIFACTS.joinpath(*parts)).read_text(encoding="utf-8"))
    return d.get("payload", d)


def save(fig, name: str) -> None:
    """Vector for LaTeX, raster for Word.

    python-docx embeds raster only, and the .docx is the graded artifact -- so a figure
    that exists solely as a PDF is a figure the judged document cannot show.
    """
    OUT.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT / f"{name}.pdf")
    fig.savefig(OUT / f"{name}.png", dpi=200)
    plt.close(fig)
    print(f"  {name}.pdf + .png")


def fig_coevolution() -> None:
    """The headline: success flat, cost climbing. Two units, so two axes."""
    a = load("attack", "rounds.json")
    rounds = [r["round"] for r in a]

    fig, ax = plt.subplots(figsize=(6.2, 2.9))
    ax.plot(rounds, [r["asr"] * 100 for r in a], "-o", color=ATTACK, lw=2, ms=5,
            label="Attack success rate")
    ax.set_ylim(0, 105)
    ax.set_ylabel("Attack success (%)", color=ATTACK)
    ax.set_xlabel("Adversarial retraining round")
    ax.set_xticks(rounds)
    ax.yaxis.grid(True)
    ax.set_axisbelow(True)

    ax2 = ax.twinx()
    ax2.spines["top"].set_visible(False)
    ax2.plot(rounds, [r["median_queries"] for r in a], "--s", color=DEFEND, lw=2, ms=5,
             label="Median queries to find an evasion")
    ax2.set_ylabel("Median queries", color=DEFEND)

    h1, l1 = ax.get_legend_handles_labels()
    h2, l2 = ax2.get_legend_handles_labels()
    ax.legend(h1 + h2, l1 + l2, loc="center left", frameon=False, fontsize=8)
    ax.set_title("Retraining moved the attacker's search cost, not its success rate")
    save(fig, "coevolution")


def fig_dosage() -> None:
    """We refuted our own excuse: 5000x the dosage changes nothing and costs PR-AUC."""
    d = load("attack", "dosage_sweep.json")
    arms = d["arms"]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(6.6, 2.7))

    for arm in arms:
        rs = [r["round"] for r in arm["rounds"]]
        ax1.plot(rs, [r["asr"] * 100 for r in arm["rounds"]], "-o", color=ATTACK,
                 lw=1.2, ms=3, alpha=0.75)
        ax2.plot(rs, [r["pr_auc"] for r in arm["rounds"]], "-o", lw=1.2, ms=3,
                 color=DEFEND, alpha=0.35 + 0.1 * arms.index(arm))

    ax1.set_ylim(0, 105)
    ax1.set_ylabel("Attack success (%)")
    ax1.set_xlabel("Round")
    ax1.set_title(f"Every arm, every round", fontsize=9)
    ax1.yaxis.grid(True); ax1.set_axisbelow(True)
    ax1.set_xticks([0, 1, 2])

    ax2.set_ylabel("Detector PR-AUC")
    ax2.set_xlabel("Round")
    lo = min(r["pr_auc"] for a in arms for r in a["rounds"])
    ax2.set_ylim(lo - 0.03, 0.97)
    ax2.set_title("What the dosage cost", fontsize=9)
    ax2.yaxis.grid(True); ax2.set_axisbelow(True)
    ax2.set_xticks([0, 1, 2])

    weights = [a["weight"] for a in arms]
    fig.suptitle(
        f"Adversarial dosage {min(weights):g}x to {max(weights):g}x on {d['rows']:,} rows",
        fontsize=10, y=1.04,
    )
    save(fig, "dosage")


def fig_threshold() -> None:
    """Can the defender buy their way out by declining more? No, and here is the bill."""
    t = load("attack", "threshold_sweep.json")
    arms = t["arms"]
    fpr = [a["fpr_budget"] * 100 for a in arms]

    fig, ax = plt.subplots(figsize=(6.2, 2.9))
    ax.plot(fpr, [a["asr"] * 100 for a in arms], "-o", color=ATTACK, lw=2, ms=5,
            label="Attack success rate")
    ax.set_xscale("log")
    ax.set_ylim(0, 105)
    ax.set_xlabel("False-positive budget (%, log scale)")
    ax.set_ylabel("Attack success (%)", color=ATTACK)
    ax.yaxis.grid(True); ax.set_axisbelow(True)

    ax2 = ax.twinx()
    ax2.spines["top"].set_visible(False)
    ax2.plot(fpr, [a["declines_per_100k"] for a in arms], "--s", color=DEFEND, lw=2, ms=5,
             label="Legitimate declines per 100k")
    ax2.set_yscale("log")
    ax2.set_ylabel("Legitimate declines per 100k", color=DEFEND)
    ax2.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:,.0f}"))

    h1, l1 = ax.get_legend_handles_labels()
    h2, l2 = ax2.get_legend_handles_labels()
    ax.legend(h1 + h2, l1 + l2, loc="center left", frameon=False, fontsize=8)
    ax.set_title("Widening the net does not stop the attack; it declines real customers")
    save(fig, "threshold")


def _unwrap(doc):
    """Envelope-wrapped artifacts keep their fields under payload."""
    return doc.get("payload", doc)


def fig_adversarial_detection() -> None:
    """Pillar III: does the defence detect the attacks we generated?"""
    r = _unwrap(load("attack", "adversarial_detection.json"))["report"]

    labels = ["Held-out\nadversarial", "Seen in\ntraining", "Real fraud", "Legitimate\ndeclines"]
    before = [r["holdout_recall_before"] * 100, 0.0, r["real_fraud_recall_before"] * 100,
              r["legit_fpr_before"] * 100 * 1000]
    after = [r["holdout_recall_after"] * 100, r["train_recall_after"] * 100,
             r["real_fraud_recall_after"] * 100, r["legit_fpr_after"] * 100 * 1000]

    fig, ax = plt.subplots(figsize=(6.2, 2.9))
    x = range(len(labels))
    ax.bar([i - 0.19 for i in x], before, 0.38, label="Before retraining", color=RULE,
           edgecolor=MUTED, linewidth=0.6)
    ax.bar([i + 0.19 for i in x], after, 0.38, label="After retraining", color=DEFEND)
    for i, (b, a) in enumerate(zip(before, after)):
        ax.text(i - 0.19, b + 1.5, f"{b:.1f}", ha="center", fontsize=7.5, color=MUTED)
        ax.text(i + 0.19, a + 1.5, f"{a:.1f}", ha="center", fontsize=7.5, color=DEFEND)
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels, fontsize=8)
    ax.set_ylabel("Recall (%)   ·   declines per 100k")
    ax.set_ylim(0, 118)
    ax.yaxis.grid(True); ax.set_axisbelow(True)
    ax.legend(frameon=False, fontsize=8, loc="upper right")
    ax.set_title("The defence detects the attacks — and the ceiling is memorisation")
    save(fig, "adversarial_detection")


def fig_agentic() -> None:
    """Two vendors, before and after, with the exact test on each."""
    rows = []
    for name, f in [("gpt-oss-120b\n(Groq)", "redteam-groq.json"),
                    ("nemotron-3-super\n(NVIDIA NIM)", "redteam-nvidia.json")]:
        p = ARTIFACTS / "agentic" / f
        if not p.exists():
            continue
        cats = load("agentic", f)
        att = sum(c["attempts"] for c in cats)
        rows.append((name, sum(c["success_before"] for c in cats),
                     sum(c["success_after"] for c in cats), att))
    if not rows:
        return
    rows.append(("Pooled", sum(r[1] for r in rows), sum(r[2] for r in rows),
                 sum(r[3] for r in rows)))

    fig, ax = plt.subplots(figsize=(6.2, 2.6))
    x = range(len(rows))
    before = [r[1] / r[3] * 100 for r in rows]
    after = [r[2] / r[3] * 100 for r in rows]
    ax.bar([i - 0.19 for i in x], before, 0.38, label="Defences off", color=ATTACK)
    ax.bar([i + 0.19 for i in x], after, 0.38, label="Defences on", color=DEFEND)
    for i, r in enumerate(rows):
        ax.text(i - 0.19, before[i] + 0.12, f"{r[1]}/{r[3]}", ha="center", fontsize=7.5, color=ATTACK)
        ax.text(i + 0.19, after[i] + 0.12, f"{r[2]}/{r[3]}", ha="center", fontsize=7.5, color=DEFEND)
    ax.set_xticks(list(x))
    ax.set_xticklabels([r[0] for r in rows], fontsize=8)
    ax.set_ylabel("Exploit rate (%)")
    ax.set_ylim(0, max(before) * 1.35)
    ax.yaxis.grid(True); ax.set_axisbelow(True)
    ax.legend(frameon=False, fontsize=8)
    ax.set_title("Indirect prompt injection, measured on two vendors")
    save(fig, "agentic")


def fig_constraints() -> None:
    """The contract the attacker is held to, as a picture of the search space."""
    s = json.loads((ARTIFACTS / "feature_schema.json").read_text(encoding="utf-8"))
    frozen, coupled = set(s["frozen"]), set(x for g in s["coupled_groups"] for x in g)
    tiers = {"Frozen": [], "Coupled": [], "Free": []}
    for c in s["columns"]:
        tiers["Frozen" if c in frozen else "Coupled" if c in coupled else "Free"].append(c)

    colours = {"Frozen": DEFEND, "Coupled": "#8a5a08", "Free": ATTACK}
    notes = {
        "Frozen": "inherited from the victim;\nexcluded from the search",
        "Coupled": "moves only as a unit, to a\nmerchant the network contains",
        "Free": "the attacker's levers, clipped\nto the observed band",
    }

    fig, axes = plt.subplots(1, 3, figsize=(6.6, 2.6))
    for ax, (tier, cols) in zip(axes, tiers.items()):
        ax.axis("off")
        ax.add_patch(plt.Rectangle((0, 0), 1, 1, transform=ax.transAxes, fill=False,
                                   edgecolor=colours[tier], linewidth=1.4))
        ax.text(0.5, 0.93, f"{tier}  ·  {len(cols)}", transform=ax.transAxes, ha="center",
                fontsize=9.5, color=colours[tier], weight="medium")
        ax.text(0.5, 0.80, notes[tier], transform=ax.transAxes, ha="center", va="top",
                fontsize=6.8, color=MUTED)
        for i, c in enumerate(cols):
            ax.text(0.5, 0.62 - i * 0.062, c, transform=ax.transAxes, ha="center",
                    fontsize=6.6, family="monospace", color=INK)
    fig.suptitle(f"Every one of the detector's {len(s['columns'])} inputs is assigned a tier",
                 fontsize=10, y=1.02)
    save(fig, "constraints")


def build_numbers() -> None:
    """Emit every figure the prose quotes as a LaTeX macro, read from the artifacts.

    The walkthrough has caught itself three times quoting a number that had moved. A
    document that types its own results will do that again; one that \input{}s them
    cannot. If an artifact changes, the sentence changes with it or the build breaks.
    """
    a = load("attack", "rounds.json")
    d = load("detect", "rounds.json")
    lat = load("latency.json")
    corpus = json.loads((ARTIFACTS / "data_provenance.json").read_text(encoding="utf-8"))
    schema = json.loads((ARTIFACTS / "feature_schema.json").read_text(encoding="utf-8"))
    feas = load("attack", "feasibility.json")
    ad = _unwrap(load("attack", "adversarial_detection.json"))
    ds = load("attack", "dosage_sweep.json")
    ts = load("attack", "threshold_sweep.json")

    first, last = a[0], a[-1]
    weights = [x["weight"] for x in ds["arms"]]
    worst = min(r["pr_auc"] for arm in ds["arms"] for r in arm["rounds"])
    base = ds["arms"][0]["rounds"][0]["pr_auc"]
    widest = ts["arms"][-1]
    r = ad["report"]

    def pct(x, dp=1):
        return f"{x * 100:.{dp}f}"

    m = {
        # Corpus
        "CorpusRows": f"{corpus['n_rows']:,}",
        "CorpusFraud": f"{corpus['n_fraud']:,}",
        "CorpusBaseRate": f"{corpus['fraud_rate'] * 100:.3f}",
        "CorpusCards": f"{corpus['n_cards']:,}",
        # Constraint contract
        "NumFeatures": str(len(schema["columns"])),
        "NumFrozen": str(len(schema["frozen"])),
        "NumCoupled": str(len({c for g in schema["coupled_groups"] for c in g})),
        "NumFree": str(len(schema["mutable"])),
        # Co-evolution (temporal split -- P1's published round 0)
        "AsrFirst": pct(first["asr"]),
        "AsrLast": pct(last["asr"]),
        "LzeroFirst": f"{first['mean_l0']:.2f}",
        "LzeroLast": f"{last['mean_l0']:.2f}",
        "LzeroRise": f"{(last['mean_l0'] / first['mean_l0'] - 1) * 100:+.0f}",
        "QueriesFirst": str(first["median_queries"]),
        "QueriesLast": str(last["median_queries"]),
        "QueriesRise": f"{(last['median_queries'] / first['median_queries'] - 1) * 100:+.0f}",
        "LoopPrAuc": f"{d[0]['pr_auc']:.3f}",
        "LoopNTrain": f"{d[0]['n_train']:,}",
        # Sweeps (stratified split -- a different experiment; never mix with the above)
        "SweepRows": f"{ds['rows']:,}",
        "NTrainStratified": f"{ds['n_train']:,}",
        "PrAucStratified": f"{base:.4f}",
        "DosageMin": f"{min(weights):g}",
        "DosageMax": f"{max(weights):g}",
        "DosageWorstPrAuc": f"{worst:.4f}",
        "DosagePrAucDrop": f"{(1 - worst / base) * 100:.1f}",
        "WidestBudget": f"{widest['fpr_budget'] * 100:g}",
        "WidestAsr": pct(widest["asr"], 1),
        "WidestDeclines": f"{widest['declines_per_100k']:,.0f}",
        # Adversarial detection (pillar III)
        "AdvHoldoutBefore": pct(r["holdout_recall_before"], 1),
        "AdvHoldoutAfter": pct(r["holdout_recall_after"], 1),
        "AdvTrainAfter": pct(r["train_recall_after"], 0),
        "AdvRealBefore": pct(r["real_fraud_recall_before"], 1),
        "AdvRealAfter": pct(r["real_fraud_recall_after"], 1),
        "AdvDeclinesBefore": f"{r['legit_fpr_before'] * 100000:.0f}",
        "AdvDeclinesAfter": f"{r['legit_declines_per_100k_after']:.0f}",
        "AdvHoldoutN": str(r["n_adversarial_holdout"]),
        # The adversarial-detection run is a subsample, not the full corpus. Quoting
        # its recall beside the full-run PR-AUC without saying so reads as one experiment.
        "AdvRows": f"{ad['rows']:,}",
        # Feasibility audit
        "ImpossibleShare": pct(feas["impossible_merchant_share"], 1),
        # Serving (SERVER-side ONNX -- not the browser walker)
        "LatencyPFifty": f"{lat['p50_ms']:.3f}",
        "LatencyPNine": f"{lat['p99_ms']:.3f}",
        "LatencySamples": f"{lat['n_samples']:,}",
    }

    lines = [
        "% Generated by scripts/build_figures.py -- do not edit.",
        "% Every macro below is read from artifacts/*.json at build time, so the prose",
        "% cannot quote a number the pipeline has since moved.",
        "",
    ]
    bs = chr(92)
    lines += [f"{bs}newcommand{{{bs}{k}}}{{{v}}}" for k, v in m.items()]
    dest = ROOT / "docs" / "submission" / "numbers.tex"
    dest.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"  numbers.tex ({len(m)} macros)")


def main() -> int:
    style()
    print("writing figures to docs/submission/figures/")
    fig_coevolution()
    fig_dosage()
    fig_threshold()
    fig_adversarial_detection()
    fig_agentic()
    fig_constraints()
    build_numbers()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
