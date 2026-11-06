#!/usr/bin/env python3
"""Run the structured race pipeline from TARGET HTML, DATE2 text, and normalized Tospo comments.

The Tospo argument is intentionally a normalized horse-level JSON input. This
runner does not pretend to parse an unverified raw Tospo export.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

TOOLS = Path(__file__).resolve().parent

def run(command):
    subprocess.run([str(part) for part in command], check=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target-html", type=Path, required=True)
    parser.add_argument("--date2-text", type=Path, required=True)
    parser.add_argument("--tospo-normalized", type=Path, required=True,
                        help="Normalized JSON: horses[{horseNumber,horseName,currentComment,previousRunComment,isIchioshi}]")
    parser.add_argument("-o", "--output", type=Path, required=True)
    args = parser.parse_args()

    if not args.target_html.is_file():
        parser.error(f"TARGET HTML not found: {args.target_html}")
    if not args.date2_text.is_file():
        parser.error(f"DATE2 text not found: {args.date2_text}")
    if not args.tospo_normalized.is_file():
        parser.error(f"normalized Tospo JSON not found: {args.tospo_normalized}")

    with tempfile.TemporaryDirectory(prefix="kido-race-") as tmp:
        temp = Path(tmp)
        target_json = temp / "target.json"
        date2_rows = temp / "date2-rows.json"
        date2_mapped = temp / "date2-mapped.json"

        run([sys.executable, TOOLS / "extract-target-race.py",
             args.target_html, "--out", target_json])
        target = json.loads(target_json.read_text(encoding="utf-8"))
        race = target["race"]
        if race.get("surface") not in ("芝", "ダート") or not race.get("venue") or not race.get("distanceM"):
            raise ValueError("TARGETからDATE2マッピングに必要な競馬場・芝ダート・距離を確定できません")
        course_label = f'{race["venue"]}{"ダ" if race["surface"] == "ダート" else "芝"}{race["distanceM"]}m'
        direction = race.get("direction") if race.get("direction") in ("左", "右") else "不明"

        run([sys.executable, TOOLS / "extract-date2-rows.py",
             args.date2_text, "--output", date2_rows])
        run([sys.executable, TOOLS / "map-date2-approved.py",
             date2_rows, "--surface", race["surface"],
             "--course-label", course_label,
             "--direction", direction, "--output", date2_mapped])
        run([sys.executable, TOOLS / "merge-race-sources.py",
             "--target", target_json, "--date2", date2_mapped,
             "--tospo", args.tospo_normalized, "--output", args.output])

    final = json.loads(args.output.read_text(encoding="utf-8"))
    if len(final.get("horses", [])) != final["race"]["fieldSize"]:
        raise ValueError("統合後の馬データ件数とTARGET出走頭数が一致しません")
    print(f'PASS: {final["race"]["date"]} {final["race"]["venue"]}{final["race"]["raceNumber"]}R / {len(final["horses"])}頭')
    print("Note: Tospo input was already normalized; raw Tospo parsing is not part of this runner.")

if __name__ == "__main__":
    main()
