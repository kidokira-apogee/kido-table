#!/usr/bin/env python3
"""Extract TARGET's five pedigree cells and exact source colors from an HTML export."""
from __future__ import annotations
import argparse
import json
import re
from html.parser import HTMLParser
from pathlib import Path

KEYS = ("sire", "dam", "damsire", "sireLine", "damsireLine")
COLOR_KEYS = ("sireBackground", "damText", "damsireBackground", "sireLineBackground", "damsireLineBackground")

def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()

class TargetTableParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self.row, self.cell, self.in_font = [], None, None, 0
    def handle_starttag(self, tag, attrs):
        a = {k.lower(): v for k, v in attrs}
        if tag.lower() == "tr":
            self.row = []
        elif tag.lower() == "td" and self.row is not None:
            self.cell = {"text": [], "background": a.get("bgcolor"), "textColor": None}
        elif tag.lower() == "font" and self.cell is not None:
            self.in_font += 1
            if self.cell["textColor"] is None and a.get("color"):
                self.cell["textColor"] = a["color"]
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
    parser = TargetTableParser()
    parser.feed(path.read_text(encoding="utf-8-sig"))
    found, seen = [], set()
    for row in parser.rows:
        if not row or not row[0]["text"].isdigit():
            continue
        number = int(row[0]["text"])
        if len(row) < 6:
            raise ValueError(f"horse {number}: expected five pedigree cells; got {len(row)} total cells")
        cells = row[-5:]
        values = [c["text"] for c in cells]
        values[0] = re.sub(r"^父\s*", "", values[0]).strip()
        values[2] = re.sub(r"^[ＢB]\s*", "", values[2]).strip()
        if number in seen:
            raise ValueError(f"duplicate horse number: {number}")
        seen.add(number)
        ped = dict(zip(KEYS, values))
        ped["colors"] = dict(zip(COLOR_KEYS, [
            cells[0]["background"], cells[1]["textColor"], cells[2]["background"],
            cells[3]["background"], cells[4]["background"]
        ]))
        found.append({"horseNumber": number, "pedigree": ped})
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
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()
    records = extract(args.target_html)
    payload = json.dumps(records, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.write_text(payload, encoding="utf-8")
        print(f"PASS: {len(records)} horses -> {args.out}")
    else:
        print(payload, end="")

if __name__ == "__main__":
    main()
