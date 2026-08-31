"""Package the code the Kaggle sweep needs into an uploadable zip.

Kaggle notebooks have Internet off by default -- turning it on needs a phone-verified
account -- so `git clone` is not a path we can rely on. Uploading the code as a dataset
input works regardless, and this builds that upload.

The bundle stamps its own git sha. A zip uploaded once and forgotten is the obvious way to
lose an overnight run to code that no longer matches the repo, and a silent mismatch is
worse than a loud one: the notebook prints this sha on startup so a stale bundle announces
itself in the first cell rather than in numbers nobody can reproduce.

    python scripts/make_kaggle_bundle.py
"""

from __future__ import annotations

import json
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "kaggle_code.zip"


def _git(*args: str) -> str:
    try:
        return subprocess.run(
            ["git", "-C", str(ROOT), *args], capture_output=True, text=True, check=True
        ).stdout.strip()
    except Exception:  # noqa: BLE001 -- a bundle built outside a checkout is still usable
        return "unknown"


def main() -> int:
    sha = _git("rev-parse", "--short", "HEAD")
    dirty = bool(_git("status", "--porcelain", "--", "src", "scripts"))

    info = {
        "git_sha": sha,
        "dirty": dirty,
        "built_at": datetime.now(timezone.utc).isoformat(),
    }

    n = 0
    with zipfile.ZipFile(DEST, "w", zipfile.ZIP_DEFLATED) as z:
        for path in sorted((ROOT / "src" / "adversarial_payments").rglob("*.py")):
            if "__pycache__" in path.parts:
                continue
            z.write(path, path.relative_to(ROOT / "src"))
            n += 1
        z.write(ROOT / "scripts" / "run_dosage_sweep.py", "run_dosage_sweep.py")
        n += 1
        z.writestr("BUNDLE_INFO.json", json.dumps(info, indent=2) + "\n")

    print(f"wrote {DEST.name}  ({n} files, {DEST.stat().st_size / 1024:.1f} KB)")
    print(f"  git_sha : {sha}{'  (DIRTY -- uncommitted changes are in this bundle)' if dirty else ''}")
    if dirty:
        print("  Commit first if you want the bundle to match a pushed revision.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
