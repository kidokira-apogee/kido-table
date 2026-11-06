#!/usr/bin/env python3
"""Extract all 90 TARGET horse-row cell styles and merge them by horse number/name.

Supports UTF-8/Shift-JIS, BGCOLOR, FONT COLOR, and inline CSS color/background.
No source colors are semantically mapped or normalized.
"""
from __future__ import annotations
import argparse
import json
import re
from html.parser import HTMLParser
from pathlib import Path

PROFILE_KEYS = ("horseNumber", "horseName", "sexAge", "handicapWeight", "jockeyRaw", "affiliation", "trainer")
RUN_KEYS = (
    "dateRaw", "courseRaw", "ageClass", "class", "raceName", "weight", "jockey",
    "bodyWeight", "bodyWeightChange", "going", "mark", "fieldSize", "horseNumber",
    "popularity", "finish", "margin", "index", "last3F", "last3FRank", "interval",
    "blinkers", "passingOrder1", "passingOrder2", "passingOrder3", "passingOrder4",
    "runningStyleRaw"
)
PEDIGREE_KEYS = ("sire", "dam", "damsire", "sireLine", "damsireLine")
COLOR_KEYS = ("sireBackground", "damText", "damsireBackground", "sireLineBackground", "damsireLineBackground")

def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()

def style_declarations(value):
    result = {}
    for declaration in (value or "").split(";"):
        if ":" not in declaration:
            continue
        key, val = declaration.split(":", 1)
        result[key.strip().lower()] = val.strip()
    return result

def style_of(cell):
    return {"backgroundColor": cell.get("background"), "textColor": cell.get("textColor")}

class TargetTableParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self.row, self.cell, self.in_font = [], None, None, 0
    def handle_starttag(self, tag, attrs):
        a = {k.lower(): v for k, v in attrs}
        css = style_declarations(a.get("style"))
        if tag.lower() == "tr":
            self.row = []
        elif tag.lower() == "td" and self.row is not None:
            self.cell = {
                "text": [],
                "background": a.get("bgcolor") or css.get("background-color") or css.get("background"),
                "textColor": a.get("color") or css.get("color")
            }
        elif self.cell is not None:
            if tag.lower() == "font":
                self.in_font += 1
            if self.cell["textColor"] is None:
                self.cell["textColor"] = a.get("color") or css.get("color")
            if self.cell["background"] is None:
                self.cell["background"] = a.get("bgcolor") or css.get("background-color") or css.get("background")
    def handle_endtag(self, tag):
        t = tag.lower()
        if t == "font" and self.in_font:
            self.in_font -= 1
        elif t == "td" and self.cell is not None and self.row is not None:
            self.cell["text"] = clean_text("".join(self.cell["text"]))
            self.row.append(self.cell)
            self.cell = None
        elif t == "tr" and self.row is not None:
            if self.row:
                self.rows.append(self.row)
            self.row, self.cell, self.in_font = None, None, 0
    def handle_data(self, data):
        if self.cell is not None:
            self.cell["text"].append(data)

def extract(path: Path):
    try:
        raw = path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        raw = path.read_text(encoding="cp932")
    parser = TargetTableParser()
    parser.feed(raw)
    found, seen = [], set()
    for row in parser.rows:
        if not row or not row[0]["text"].isdigit():
            continue
        number = int(row[0]["text"])
        if len(row) != 90:
            raise ValueError(f"horse {number}: expected exactly 90 TARGET cells; got {len(row)}")
        if number in seen:
            raise ValueError(f"duplicate horse number: {number}")
        seen.add(number)
        horse_name = row[1]["text"]
        profile_styles = {key: style_of(cell) for key, cell in zip(PROFILE_KEYS, row[:7])}
        recent_styles = []
        for run_index in range(3):
            cells = row[7 + run_index * 26: 7 + (run_index + 1) * 26]
            run_styles = {}
            for key, cell in zip(RUN_KEYS[:21], cells[:21]):
                run_styles[key] = style_of(cell)
            run_styles["passingOrder"] = [style_of(cell) for cell in cells[21:25]]
            run_styles["runningStyleRaw"] = style_of(cells[25])
            recent_styles.append(run_styles)
        cells = row[85:90]
        values = [c["text"] for c in cells]
        values[0] = re.sub(r"^父\s*", "", values[0]).strip()
        values[2] = re.sub(r"^[ＢB]\s*", "", values[2]).strip()
        pedigree = dict(zip(PEDIGREE_KEYS, values))
        pedigree["colors"] = dict(zip(COLOR_KEYS, [
            cells[0]["background"], cells[1]["textColor"], cells[2]["background"],
            cells[3]["background"], cells[4]["background"]
        ]))
        pedigree["sourceStyles"] = {key: style_of(cell) for key, cell in zip(PEDIGREE_KEYS, cells)}
        found.append({
            "horseNumber": number,
            "horseName": horse_name,
            "pedigree": pedigree,
            "sourceStyles": {"profile": profile_styles, "recentRuns": recent_styles}
        })
    found.sort(key=lambda x: x["horseNumber"])
    nums = [x["horseNumber"] for x in found]
    if not nums:
        raise ValueError("no horse rows found")
    if nums != list(range(1, len(nums) + 1)):
        raise ValueError(f"horse numbers must be consecutive from 1: {nums}")
    return found

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("target_html", type=Path)
    ap.add_argument("--merge", type=Path, help="structured JSON; merge only after exact horse-number/name check")
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()
    records = extract(args.target_html)
    if args.merge:
        race_data = json.loads(args.merge.read_text(encoding="utf-8"))
        horses = race_data.get("horses")
        if not isinstance(horses, list) or len(horses) != len(records):
            raise ValueError("race JSON horse count does not match TARGET rows")
        by_number = {h.get("horseNumber"): h for h in horses}
        for rec in records:
            horse = by_number.get(rec["horseNumber"])
            if horse is None:
                raise ValueError(f"horse number {rec['horseNumber']} missing from race JSON")
            if clean_text(horse.get("horseName", "")) != rec["horseName"]:
                raise ValueError(f"horse name mismatch at number {rec['horseNumber']}: JSON={horse.get('horseName')!r}, TARGET={rec['horseName']!r}")
            horse["pedigree"] = rec["pedigree"]
            horse["sourceStyles"] = rec["sourceStyles"]
        audit = race_data.setdefault("sourceAudit", {})
        audit["targetRows"] = len(records)
        audit["targetCellsPerHorse"] = 90
        audit["targetSourceStyles"] = "all 90 TARGET cells mapped by profile/recent-run/pedigree field"
        audit["horseNumberNameMatch"] = f"{len(records)}/{len(records)}"
        audit["pedigreeSource"] = "① TARGET pedigree cells"
        audit["pedigreeColorAttributes"] = "BGCOLOR / FONT COLOR / inline CSS copied verbatim"
        audit["pedigreeHorseNumberNameMatch"] = f"{len(records)}/{len(records)}"
        payload = json.dumps(race_data, ensure_ascii=False, indent=2) + "\n"
    else:
        payload = json.dumps(records, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.write_text(payload, encoding="utf-8")
        print(f"PASS: {len(records)} horses / 90 cells each" + (f" merged -> {args.out}" if args.merge else f" extracted -> {args.out}"))
    else:
        print(payload, end="")

if __name__ == "__main__":
    main()
