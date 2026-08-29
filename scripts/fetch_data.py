"""Acquire the transaction dataset, honestly.

Tries the real Sparkov dataset from Kaggle first. If that is not obtainable -- no
credentials, no network, dataset moved -- it falls back to a *deterministic synthetic
generator* with Sparkov's column set and base rate, and records that fact in
``artifacts/data_provenance.json``.

    python scripts/fetch_data.py                 # kaggle, else synthetic
    python scripts/fetch_data.py --synthetic     # skip kaggle entirely
    python scripts/fetch_data.py --force         # re-fetch / regenerate
    python scripts/fetch_data.py --rows 50000    # smaller synthetic corpus

The ``source`` field in the provenance file is load-bearing. Everything downstream --
the notebook, the dashboard, the deck -- reads it, and a synthetic run is labelled as
such wherever a number from it appears.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from adversarial_payments.data.load import (  # noqa: E402
    DEFAULT_SYNTHETIC_ROWS,
    INTERIM_PATH,
    PROVENANCE_PATH,
    ensure_dataset,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="re-fetch even if data exists")
    parser.add_argument(
        "--synthetic", action="store_true", help="skip the Kaggle attempt entirely"
    )
    parser.add_argument(
        "--rows",
        type=int,
        default=DEFAULT_SYNTHETIC_ROWS,
        help=f"row count for the synthetic fallback (default {DEFAULT_SYNTHETIC_ROWS:,})",
    )
    args = parser.parse_args(argv)

    provenance = ensure_dataset(
        force=args.force,
        allow_download=not args.synthetic,
        n_rows=args.rows,
    )

    print(json.dumps(provenance, indent=2))
    print(f"\ndataset  -> {INTERIM_PATH}")
    print(f"provenance -> {PROVENANCE_PATH}")

    if provenance["source"] != "kaggle":
        print(
            "\n"
            "  !! SYNTHETIC DATA IN USE -- the real Sparkov download was unavailable.\n"
            "     Every metric produced from this corpus describes the generator in\n"
            "     src/adversarial_payments/data/synthetic.py, not the Sparkov dataset.\n"
            "     Label it that way in the notebook, the dashboard and the deck.\n",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
