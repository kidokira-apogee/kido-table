#!/usr/bin/env python3
"""Map lossless DATE2 rows into the approved four-tab display contract.

Stage 2 only. Race conditions must be supplied from TARGET; this mapper never
reads DATE2 race headers. Unknown rows and repeated labels remain auditable.
"""
from __future__ import annotations
import argparse, json, re
from pathlib import Path

FRAME_RE = re.compile(r"^[１-８1-8]枠$")
DISTANCE_RE = re.compile(r"^\d{4}m-\d{4}m$")
ROTATION_RE = re.compile(r"^中\d+(?:～\d+)?週(?:以上)?$")
SEASON_RE = re.compile(r"^\d{1,2}月～\d{1,2}月$")
RECORD_LABELS = {"全着", "全芝", "全ダ"}


def is_record(row):
    values = row.get("values", [])
    return len(values) == 4 and all(re.fullmatch(r"\d+", v) for v in values)


def record(row):
    return {"label": row["label"], "record": row["values"]}


def value(row):
    values = row.get("values", [])
    return {"label": row["label"], "value": values[0] if values else ""}


def norm_frame(value):
    return str(value).translate(str.maketrans("１２３４５６７８", "12345678"))


def map_horse(horse, surface, course_label, direction):
    rows = horse["sourceRows"]

    def first(label, predicate=is_record):
        return next((row for row in rows if row["label"] == label and predicate(row)), None)

    overall = []
    for label in ("全着", "全芝", "全ダ"):
        row = first(label)
        if row:
            overall.append(record(row))
    venue_rows = [
        row for row in rows
        if row["label"] not in RECORD_LABELS
        and not re.search(r"(?:芝|ダ)\d*m?$", row["label"])
        and not DISTANCE_RE.match(row["label"])
        and is_record(row)
    ]
    if venue_rows:
        overall.append(record(venue_rows[0]))

    suffix = "ダ" if surface == "ダート" else "芝"
    surface_conditions = [
        record(row) for row in rows
        if is_record(row) and row["label"].endswith(suffix)
        and any(token in row["label"] for token in ("坂有", "平坦", "重不"))
    ]
    distance_bands = [
        record(row) for row in rows
        if is_record(row) and DISTANCE_RE.match(row["label"])
    ]

    # Repeated course labels have distinct shapes: four numeric cells for
    # records, one text cell for best-performance information.
    course_records, seen_course = [], set()
    for row in rows:
        label = row["label"]
        if is_record(row) and (re.search(r"(?:芝|ダ)\d+m$", label) or label.startswith("全場")):
            if label not in seen_course:
                course_records.append(record(row))
                seen_course.add(label)

    performance = []
    for label in ("当距離", "芝最高", "ダ最高"):
        row = first(label, lambda item: bool(item.get("values")))
        if row:
            performance.append(value(row))

    rotation = next((r for r in rows if ROTATION_RE.match(r["label"]) and is_record(r)), None)
    season = next((r for r in rows if SEASON_RE.match(r["label"]) and is_record(r)), None)
    pace = [record(r) for r in rows if is_record(r) and r["label"] in ("Sペ", "Hペ")]
    turns = [record(r) for r in rows if is_record(r) and r["label"] in ("右回", "左回")]
    field_pop = [record(r) for r in rows if is_record(r) and r["label"] in ("９頭下", "10頭上", "３人上", "４人下")]
    frame_records = [record(r) for r in rows if is_record(r) and r["label"] in ("内枠", "中枠", "外枠")]
    actual_frame = norm_frame(horse.get("frameNumber", ""))
    for row in rows:
        if FRAME_RE.match(row["label"]) and norm_frame(row["label"][0]) == actual_frame and is_record(row):
            frame_records.append(record(row))
            break
    top2 = [value(r) for r in rows if r["label"] in ("連対体重", "連対距離", "連対平均") and r.get("values")]

    summary = {}
    row = first("全着")
    if row:
        summary["allRecord"] = record(row)
    row = first("全ダ" if surface == "ダート" else "全芝")
    if row:
        summary["surfaceRecord"] = record(row)
    row = first(course_label) if course_label else None
    if row:
        summary["courseRecord"] = record(row)
    turn_label = "左回" if direction == "左" else "右回" if direction == "右" else None
    row = first(turn_label) if turn_label else None
    if row:
        summary["turnRecord"] = record(row)
    row = first("出遅れ率", lambda item: bool(item.get("values")))
    if row:
        summary["lateStartRate"] = value(row)

    mapped = {item["label"] for item in overall + surface_conditions + distance_bands + course_records + performance + pace + turns + field_pop + frame_records + top2}
    if rotation:
        mapped.add(rotation["label"])
    if season:
        mapped.add(season["label"])
    if row and row["label"] == "出遅れ率":
        mapped.add("出遅れ率")

    return {
        "horseNumber": horse["horseNumber"],
        "frameNumber": horse.get("frameNumber"),
        "horseName": horse["horseName"],
        "topSummary": summary,
        "dataTabs": {
            "detail": {"overall": overall, "surfaceConditions": surface_conditions},
            "distanceCourse": {"distanceBands": distance_bands, "courseRecords": course_records, "performance": performance},
            "conditions": {
                "rotation": record(rotation) if rotation else None,
                "season": record(season) if season else None,
                "pace": pace, "turn": turns, "fieldSizeAndPopularity": field_pop
            },
            "frameAndTop2": {"frameRecords": frame_records, "top2Records": top2}
        },
        "date2Audit": {
            "sourceRows": rows,
            "mappedLabels": sorted(mapped),
            "unmappedRows": [item for item in rows if item["label"] not in mapped]
        }
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--surface", choices=["芝", "ダート"], required=True,
                        help="TARGET-derived race surface")
    parser.add_argument("--course-label", required=True,
                        help="Exact TARGET-derived course label, e.g. 東京ダ1600m")
    parser.add_argument("--direction", choices=["左", "右", "不明"], required=True,
                        help="TARGET-derived course direction")
    parser.add_argument("-o", "--output", type=Path)
    args = parser.parse_args()
    source = json.loads(args.input.read_text(encoding="utf-8"))
    result = {
        "source": "② DATE2",
        "mappingVersion": "1.0.0",
        "raceMetadataSource": "① TARGET (not read by this mapper)",
        "horseCount": len(source["horses"]),
        "horses": [map_horse(h, args.surface, args.course_label, args.direction) for h in source["horses"]]
    }
    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")


if __name__ == "__main__":
    main()
