#!/usr/bin/env python3
"""Lossless first-stage extractor for tab-delimited DATE2 horse rows.

This module deliberately does not infer race metadata, fill missing values,
or decide which labels are displayable. Unknown and repeated labels remain in
sourceRows in original order so later approved mapping can be audited.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

START = re.compile(r"^(\d+)\t(\d+)\t\s*$")


def parse(path: Path) -> dict:
    text = path.read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    starts = [i for i, line in enumerate(lines) if START.match(line)]
    if not starts:
        raise ValueError("出走馬ブロックの開始行（枠\t馬番）が見つかりません")

    horses = []
    for pos, start in enumerate(starts):
        end = starts[pos + 1] if pos + 1 < len(starts) else len(lines)
        block = lines[start:end]
        match = START.match(block[0])
        frame, number = map(int, match.groups())

        # Fixed DATE2 header positions: frame/number, marker, sire, horse,
        # dam, damsire, odds. Fail closed if this export shape changes.
        if len(block) < 7:
            raise ValueError(f"馬番{number}: ヘッダー行が不足")
        horse_name = block[3].strip()
        if not horse_name:
            raise ValueError(f"馬番{number}: 馬名が空欄")

        rows = []
        stat_lines = block[7:]
        offset = 0
        while offset < len(stat_lines):
            raw = stat_lines[offset]
            line_offset = offset + 7
            offset += 1
            if not raw.strip():
                continue
            cells = raw.split("\t")
            label = cells[0].strip()
            if not label:
                continue
            values = [cell.strip() for cell in cells[1:]]

            # Rotation and season labels appear alone, with four record
            # figures on the next line. Bind only this exact continuation.
            if not values and offset < len(stat_lines):
                continuation = stat_lines[offset].split("\t")
                if len(continuation) == 4 and all(
                    re.fullmatch(r"\d+", cell.strip()) for cell in continuation
                ):
                    values = [cell.strip() for cell in continuation]
                    raw = raw + "\n" + stat_lines[offset]
                    offset += 1

            rows.append({
                "sourceLineOffset": line_offset,
                "label": label,
                "values": values,
                "raw": raw,
            })

        horses.append({
            "horseNumber": number,
            "frameNumber": frame,
            "horseName": horse_name,
            "sourceRows": rows,
        })

    numbers = [horse["horseNumber"] for horse in horses]
    if len(numbers) != len(set(numbers)):
        raise ValueError("馬番が重複しています")

    return {"source": "② DATE2", "horseCount": len(horses), "horses": horses}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("-o", "--output", type=Path)
    args = parser.parse_args()
    result = parse(args.input)
    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")


if __name__ == "__main__":
    main()
