#!/usr/bin/env python3
"""Extract TARGET race metadata and the 90-cell horse table without supplementing other sources."""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

PROFILE_KEYS = ("horseNumber", "horseName", "sexAge", "handicapWeight", "jockeyRaw", "affiliation", "trainer")
RUN_KEYS = ("dateRaw", "courseRaw", "ageClass", "class", "raceName", "weight", "jockey", "bodyWeight", "bodyWeightChange", "going", "mark", "fieldSize", "horseNumber", "popularity", "finish", "margin", "index", "last3F", "last3FRank", "interval", "blinkers", "passingOrder1", "passingOrder2", "passingOrder3", "passingOrder4", "runningStyleRaw")
PEDIGREE_KEYS = ("sire", "dam", "damsire", "sireLine", "damsireLine")
COLOR_KEYS = ("sireBackground", "damText", "damsireBackground", "sireLineBackground", "damsireLineBackground")

def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()

def style_declarations(value):
    result = {}
    for item in (value or "").split(";"):
        if ":" in item:
            key, val = item.split(":", 1)
            result[key.strip().lower()] = val.strip()
    return result

class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self.row, self.cell = [], None, None
        self.text_parts = []
    def handle_starttag(self, tag, attrs):
        a = {k.lower(): v for k, v in attrs}
        if tag.lower() in ("br", "tr"):
            self.text_parts.append("\n")
        css = style_declarations(a.get("style"))
        if tag.lower() == "tr":
            self.row = []
        elif tag.lower() == "td" and self.row is not None:
            self.cell = {"text": [], "background": a.get("bgcolor") or css.get("background-color") or css.get("background"), "textColor": a.get("color") or css.get("color")}
        elif self.cell is not None:
            if self.cell["textColor"] is None:
                self.cell["textColor"] = a.get("color") or css.get("color")
            if self.cell["background"] is None:
                self.cell["background"] = a.get("bgcolor") or css.get("background-color") or css.get("background")
    def handle_data(self, data):
        self.text_parts.append(data)
        if self.cell is not None:
            self.cell["text"].append(data)
    def handle_endtag(self, tag):
        t = tag.lower()
        if t == "td" and self.cell is not None and self.row is not None:
            self.cell["text"] = clean("".join(self.cell["text"]))
            self.row.append(self.cell)
            self.cell = None
        elif t == "tr" and self.row is not None:
            if self.row:
                self.rows.append(self.row)
            self.row = None

def read_text(path: Path) -> str:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp932", "shift_jis"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    raise ValueError("TARGET HTML encoding is not supported")

def parse_date(line: str):
    m = re.search(r"(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日", line)
    return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else None

def parse_race_metadata(raw: str, text: str):
    title = re.search(r"<TITLE>\s*出馬表・([^<]+)</TITLE>", raw, re.I)
    title_text = unicodedata.normalize("NFKC", clean(title.group(1))) if title else ""
    lines = [clean(x) for x in text.splitlines() if clean(x)]
    normalized_text = unicodedata.normalize("NFKC", text)
    normalized_lines = [clean(x) for x in normalized_text.splitlines() if clean(x)]
    date_line = next((x for x in normalized_lines if re.search(r"\d{4}年.*\d{1,2}月.*\d{1,2}日", x)), "")
    race_line = next((x for x in normalized_lines if "R】" in x), "")
    condition_line = next((x for x in normalized_lines if re.search(r"(歳以上|歳以下|歳・)", x) and ("クラス" in x or "未勝利" in x or "オープン" in x)), "")
    surface_line = next((x for x in normalized_lines if re.search(r"(芝|ダート)\s*\d{4}m", x)), "")
    venue_match = re.search(r"出馬表・([^0-9]+?)(\d{1,2})R", title_text)
    if not venue_match:
        venue_match = re.search(r"\d{4}年.*?日.*?\d+回(東京|京都|中山|阪神|中京|新潟|福島|小倉|札幌|函館)\d+日目", date_line)
    venue = clean(venue_match.group(1)) if venue_match else None
    race_number_match = re.search(r"(\d{1,2})R", title_text)
    if not race_number_match:
        race_number_match = re.search(r"【\s*(\d{1,2})\s*Ｒ】", race_line)
    date = parse_date(date_line)
    count_match = re.search(r"(\d{1,2})頭", date_line)
    time_match = re.search(r"\[(\d{1,2}:\d{2})発走\]", date_line)
    name = None
    if race_line:
        name_match = re.search(r"【\s*\d{1,2}\s*R】\s*([^】]+)", race_line)
        if name_match:
            name = clean(name_match.group(1)).strip("　 ")
    if not name and title_text and race_number_match:
        name = clean(re.sub(r"^.*?\d{1,2}R\s*", "", title_text))
    surface_match = re.search(r"(芝|ダート)\s*(\d{4})m", surface_line)
    class_text = condition_line or None
    weight_type = None
    if class_text:
        wt = re.search(r"(ハンデ|別定|定量)", class_text)
        weight_type = wt.group(1) if wt else None
    return {
        "id": f"{date}-{venue or 'unknown'}-{int(race_number_match.group(1)) if race_number_match else 'unknown'}" if date else None,
        "date": date,
        "venue": venue,
        "raceNumber": int(race_number_match.group(1)) if race_number_match else None,
        "name": name,
        "surface": ("芝" if surface_match.group(1) == "芝" else "ダート") if surface_match else None,
        "distanceM": int(surface_match.group(2)) if surface_match else None,
        "direction": "不明",
        "going": None,
        "weather": None,
        "class": class_text,
        "conditionsRaw": class_text,
        "weightType": weight_type,
        "fieldSize": int(count_match.group(1)) if count_match else None,
        "startTime": time_match.group(1) if time_match else None,
        "metadataSource": "① TARGET"
    }

def extract(path: Path):
    raw = read_text(path)
    parser = Parser()
    parser.feed(raw)
    text = "".join(parser.text_parts)
    metadata = parse_race_metadata(raw, text)
    records, seen = [], set()
    for row in parser.rows:
        if not row or not row[0]["text"].isdigit():
            continue
        number = int(row[0]["text"])
        if len(row) != 90:
            raise ValueError(f"horse {number}: expected exactly 90 TARGET cells; got {len(row)}")
        if number in seen:
            raise ValueError(f"duplicate horse number: {number}")
        seen.add(number)
        values = [cell["text"] for cell in row]
        profile = dict(zip(PROFILE_KEYS, values[:7]))
        profile["horseNumber"] = number
        recent = []
        for idx in range(3):
            part = values[7 + idx * 26: 7 + (idx + 1) * 26]
            item = dict(zip(RUN_KEYS[:21], part[:21]))
            item["passingOrder"] = part[21:25]
            item["runningStyleRaw"] = part[25]
            item["label"] = ("前走", "2走前", "3走前")[idx]
            recent.append(item)
        pedigree_values = values[85:90]
        pedigree_values[0] = re.sub(r"^父\s*", "", pedigree_values[0]).strip()
        pedigree_values[2] = re.sub(r"^[ＢB]\s*", "", pedigree_values[2]).strip()
        pedigree = dict(zip(PEDIGREE_KEYS, pedigree_values))
        cells = row[85:90]
        pedigree["colors"] = dict(zip(COLOR_KEYS, [cells[0]["background"], cells[1]["textColor"], cells[2]["background"], cells[3]["background"], cells[4]["background"]]))
        pedigree["sourceStyles"] = {key: {"backgroundColor": cell["background"], "textColor": cell["textColor"]} for key, cell in zip(PEDIGREE_KEYS, cells)}
        profile_styles = {key: {"backgroundColor": cell["background"], "textColor": cell["textColor"]} for key, cell in zip(PROFILE_KEYS, row[:7])}
        recent_styles = []
        for idx in range(3):
            cells_run = row[7 + idx * 26: 7 + (idx + 1) * 26]
            item = {key: {"backgroundColor": cell["background"], "textColor": cell["textColor"]} for key, cell in zip(RUN_KEYS[:21], cells_run[:21])}
            item["passingOrder"] = [{"backgroundColor": cell["background"], "textColor": cell["textColor"]} for cell in cells_run[21:25]]
            item["runningStyleRaw"] = {"backgroundColor": cells_run[25]["background"], "textColor": cells_run[25]["textColor"]}
            recent_styles.append(item)
        records.append({
            "horseNumber": number,
            "frameNumber": None,
            "horseName": profile["horseName"],
            "profile": profile,
            "recentRuns": recent,
            "pedigree": pedigree,
            "sourceStyles": {"profile": profile_styles, "recentRuns": recent_styles}
        })
    records.sort(key=lambda x: x["horseNumber"])
    numbers = [x["horseNumber"] for x in records]
    if not 6 <= len(records) <= 18:
        raise ValueError(f"horse count must be 6–18; got {len(records)}")
    if numbers != list(range(1, len(records) + 1)):
        raise ValueError(f"horse numbers must be consecutive from 1: {numbers}")
    if metadata["fieldSize"] is not None and metadata["fieldSize"] != len(records):
        raise ValueError(f"TARGET metadata fieldSize {metadata['fieldSize']} != parsed horse rows {len(records)}")
    for key in ("date", "venue", "raceNumber", "name", "surface", "distanceM", "fieldSize", "startTime"):
        if metadata[key] is None:
            raise ValueError(f"TARGET race metadata could not be extracted: {key}")
    return {"race": metadata, "horses": records, "sourceAudit": {
        "metadataSource": "① TARGET",
        "horseRows": len(records),
        "targetCellsPerHorse": 90,
        "horseNumberSequence": numbers,
        "rawHtmlStored": False,
        "unknownRaceMetadata": [k for k in ("direction", "going", "weather") if metadata[k] in (None, "", "不明")]
    }}

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("target_html", type=Path)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()
    result = extract(args.target_html)
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.write_text(payload, encoding="utf-8")
        print(f"PASS: {len(result['horses'])} horses; TARGET metadata and 90 cells per horse")
    else:
        print(payload, end="")

if __name__ == "__main__":
    main()
