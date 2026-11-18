"""The reliability gate: every problem planted for the exact checks is caught, and clean drafts stay clean.

Runs the same scorer as `python -m evals.run` (exact mode), in its own database."""
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def test_exact_checks_catch_every_planted_problem():
    out = subprocess.run([sys.executable, "-m", "evals.run", "--min-catch", "100"], cwd=BACKEND,
                         capture_output=True, text=True, timeout=300, encoding="utf-8")
    assert out.returncode == 0, out.stdout[-3000:] + out.stderr[-3000:]
    for line in out.stdout.splitlines():
        if "false alarms" in line and "caught" in line and "precision" in line:
            assert "false alarms 0," in line, line
