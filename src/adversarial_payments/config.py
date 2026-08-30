"""Shared settings. Owned jointly; change only with a heads-up to the team."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Load .env before anything reads the environment.
#
# This has to happen at import time and above SETTINGS below, because Settings resolves
# every switch through default_factory at construction -- a load_dotenv() call placed after
# it would populate os.environ for nobody. python-dotenv was a declared dependency and the
# README told people to create a .env, but nothing ever called this: a key pasted into the
# file was silently invisible, and the failure surfaced as "LLM_API_KEY is empty" with the
# key sitting right there on disk.
#
# override=False so a real environment variable still beats the file, which is what CI and
# a shell-exported key both expect.
try:  # pragma: no cover -- absence is a packaging problem, not a runtime path worth branching on
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env", override=False)
except ImportError:
    pass

DATA_RAW = ROOT / "data" / "raw"
DATA_INTERIM = ROOT / "data" / "interim"
DATA_PROCESSED = ROOT / "data" / "processed"
ARTIFACTS = ROOT / "artifacts"
MODELS = ROOT / "models"

SEED = 20260829

# Kaggle dataset slug for Sparkov (see spec section 3).
KAGGLE_DATASET = "kartik2112/fraud-detection"


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    """Runtime switches. Every one of these exists to de-risk the judged demo."""

    # False => read committed artifacts/ instead of training. The demo default.
    recompute: bool = field(default_factory=lambda: _flag("RECOMPUTE", False))

    # False => run the same tasks as a plain Python loop, no Prefect. Spec 6.
    run_orchestrated: bool = field(default_factory=lambda: _flag("RUN_ORCHESTRATED", True))

    # False => replay cached LLM responses from artifacts/cache, zero network.
    llm_live: bool = field(default_factory=lambda: _flag("LLM_LIVE", False))

    # Subsample cap for fast iteration; None uses the full dataset.
    sample_rows: int | None = field(
        default_factory=lambda: int(os.environ["SAMPLE_ROWS"])
        if os.getenv("SAMPLE_ROWS")
        else None
    )

    # Adversarial rounds r = 0..n_rounds-1
    n_rounds: int = 3

    seed: int = SEED


SETTINGS = Settings()


def ensure_dirs() -> None:
    for d in (DATA_RAW, DATA_INTERIM, DATA_PROCESSED, ARTIFACTS, MODELS):
        d.mkdir(parents=True, exist_ok=True)
