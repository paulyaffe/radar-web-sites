"""Genera contenido diario y resultados cada dos horas, conservando datos.

GITHUB_OUTPUT solo recibe nombres fijos de perfiles, nunca datos externos.
"""
import argparse
import datetime as dt
import json
import os
import shutil
from pathlib import Path
import engine

ROOT = Path(__file__).parent
PROFILES = ("cocina", "masa", "energia", "deportes")


def update(force=False, scan=True):
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    selected = []
    for profile in PROFILES:
        site = ROOT/"sites"/profile
        state = engine.read_json(site/"update-state.json", {})
        if not force and profile != "deportes" and state.get("last_scan_date") == today:
            continue
        shutil.copytree(ROOT/"assets", site/"assets", dirs_exist_ok=True)
        result = engine.cycle(site, do_scan=scan)
        engine.write_json(site/"update-state.json", {"last_scan_date":today, "last_run":engine.now_iso(), "source_errors":result.get("errors", [])})
        selected.append(profile)
        print(json.dumps({"profile":profile, "pages":result["pages"], "source_errors":result.get("errors", [])}))
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
            out.write("profiles="+json.dumps(selected)+"\n")
    return selected


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    update(args.force, not args.offline)
