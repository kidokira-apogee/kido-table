#!/usr/bin/env python3
"""Strictly merge TARGET, DATE2 and Tospo horse-level data.

TARGET is the sole race-metadata authority. DATE2 contributes only topSummary
and dataTabs; Tospo contributes only current/previous comments and ichioshi.
All joins use horse number and require an exact normalized horse-name match.
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def name_key(value: str) -> str:
    return re.sub(r"\s+", "", str(value or "")).strip()


def index_horses(doc: dict, source: str) -> dict:
    horses = doc.get("horses")
    if not isinstance(horses, list):
        raise ValueError(f"{source}: horses配列がありません")
    result = {}
    for horse in horses:
        number = horse.get("horseNumber")
        name = horse.get("horseName")
        if not isinstance(number, int) or number < 1:
            raise ValueError(f"{source}: 不正な馬番 {number!r}")
        if number in result:
            raise ValueError(f"{source}: 馬番{number}が重複")
        if not name_key(name):
            raise ValueError(f"{source}: 馬番{number}の馬名が空欄")
        result[number] = horse
    return result


def validate_same_horses(target: dict, other: dict, source: str) -> None:
    target_numbers, other_numbers = set(target), set(other)
    if target_numbers != other_numbers:
        raise ValueError(
            f"{source}: 馬番集合不一致 "
            f"missing={sorted(target_numbers-other_numbers)} "
            f"extra={sorted(other_numbers-target_numbers)}"
        )
    for number in sorted(target_numbers):
        if name_key(target[number]["horseName"]) != name_key(other[number]["horseName"]):
            raise ValueError(
                f"{source}: 馬名不一致 馬番{number}: "
                f"TARGET={target[number]['horseName']!r}, "
                f"{source}={other[number]['horseName']!r}"
            )


def merge(target_doc: dict, date2_doc: dict, tospo_doc: dict) -> dict:
    race = target_doc.get("race")
    if not isinstance(race, dict):
        raise ValueError("① TARGET: race情報がありません")
    if race.get("metadataSource") != "① TARGET":
        raise ValueError("レース基本情報の出典が① TARGETではありません")
    required = ("id", "date", "venue", "raceNumber", "name", "surface",
                "distanceM", "direction", "fieldSize")
    for field in required:
        if race.get(field) in (None, ""):
            raise ValueError(f"① TARGET: 必須レース項目 {field} が欠損")

    target = index_horses(target_doc, "① TARGET")
    date2 = index_horses(date2_doc, "② DATE2")
    tospo = index_horses(tospo_doc, "③ 東スポ")
    validate_same_horses(target, date2, "② DATE2")
    validate_same_horses(target, tospo, "③ 東スポ")

    if not 6 <= len(target) <= 18:
        raise ValueError(f"出走頭数が仕様外: {len(target)}")
    if race["fieldSize"] != len(target):
        raise ValueError(
            f"TARGET出走頭数と馬データ件数が不一致: {race['fieldSize']} != {len(target)}"
        )

    merged = []
    for number in sorted(target):
        base, stats, comments = target[number], date2[number], tospo[number]
        if not isinstance(stats.get("topSummary"), dict) or not isinstance(stats.get("dataTabs"), dict):
            raise ValueError(f"DATE2 馬番{number}: topSummary/dataTabsがありません")
        current = comments.get("currentComment")
        previous = comments.get("previousRunComment")
        if not isinstance(current, str) or not isinstance(previous, str):
            raise ValueError(f"東スポ 馬番{number}: 今回・前走コメントが不足")
        ichioshi = comments.get("isIchioshi", False)
        if not isinstance(ichioshi, bool):
            raise ValueError(f"東スポ 馬番{number}: isIchioshiが真偽値ではありません")

        horse = {
            key: value for key, value in base.items()
            if key not in ("topSummary", "dataTabs", "comments", "date2Audit")
        }
        # DATE2 is the available horse-level frame source; TARGET row has no frame cell.
        horse["frameNumber"] = stats.get("frameNumber")
        horse["topSummary"] = stats["topSummary"]
        horse["dataTabs"] = stats["dataTabs"]
        horse["comments"] = {
            "current": {
                "text": current, "source": "東スポ", "isIchioshi": ichioshi
            },
            "previousRun": {"text": previous, "source": "東スポ"}
        }
        merged.append(horse)

    ichioshi_numbers = [
        horse["horseNumber"] for horse in merged
        if horse["comments"]["current"]["isIchioshi"]
    ]
    return {
        "schemaVersion": "1.0.0",
        "race": race,
        "render": {"layoutId": "tokyo9-production-locked", "preserveSourceColors": True},
        "sourceAudit": {
            "horseNumberNameMatch": f"{len(merged)}/{len(merged)}",
            "targetRows": len(target),
            "date2Rows": len(date2),
            "tospoCurrentComments": sum(bool(h["comments"]["current"]["text"]) for h in merged),
            "tospoPreviousComments": sum(bool(h["comments"]["previousRun"]["text"]) for h in merged),
            "ichioshiHorseNumbers": ichioshi_numbers,
            "raceMetadataSource": "① TARGET only",
            "date2Role": "② 各馬の実績データのみ。レース基本情報の参照・補完には使用しない",
            "tospoRole": "③ 各馬の今回・前走コメントのみ。レース基本情報の参照・補完には使用しない"
        },
        "horses": merged
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, required=True,
                        help="TARGET由来のrace + horses JSON")
    parser.add_argument("--date2", type=Path, required=True,
                        help="map-date2-approved.py の出力JSON")
    parser.add_argument("--tospo", type=Path, required=True,
                        help="馬番・馬名・currentComment・previousRunComment・isIchioshiを持つJSON")
    parser.add_argument("-o", "--output", type=Path)
    args = parser.parse_args()
    result = merge(read_json(args.target), read_json(args.date2), read_json(args.tospo))
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(payload, encoding="utf-8")
    else:
        sys.stdout.write(payload)


if __name__ == "__main__":
    main()
