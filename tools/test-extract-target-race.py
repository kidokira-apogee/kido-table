#!/usr/bin/env python3
"""Synthetic contract tests for TARGET raw race extraction."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import importlib.util
MODULE_PATH = Path(__file__).with_name("extract-target-race.py")
SPEC = importlib.util.spec_from_file_location("extract_target_race", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
extract = MODULE.extract

def make_fixture(headcount=6):
    rows = []
    for n in range(1, headcount + 1):
        vals = [str(n), f"テストホース{n}", "牡4", "56", "騎手名", "美浦", "調教師"]
        for run in range(3):
            vals.extend([
                f"10.{run+1}", "東･D16", "３上", "2勝", f"レース{run+1}", "56", "騎手名",
                "480", "+2", "良", "", "16", str(n), "3", "4", "2", "0.2", "85",
                "36.5", "2", "4", "2", "2", "2", "2", "先"
            ])
        vals.extend([f"父馬{n}", f"母馬{n}", f"母父{n}", "ロイヤルチャージャー系", "ナスルーラ系"])
        assert len(vals) == 90
        cells = "".join(f'<TD BGCOLOR="#FFC0FF">{v}</TD>' for v in vals)
        rows.append(f"<TR>{cells}</TR>")
    return """<HTML><HEAD><TITLE>出馬表・東京12R テスト特別</TITLE></HEAD><BODY>
2026年11月 1日(日)　<B>4回東京11日目</B>　6頭　[16:25発走]<BR>
<B>【１２Ｒ】 テスト特別 </B><BR>
３歳以上・２勝クラス(ハンデ)(混)[指定]　<B>ダート1600m</B>
<TABLE><TR><TH>見出し</TH></TR>""" + "".join(rows) + "</TABLE></BODY></HTML>"

class TargetRaceExtractorTests(unittest.TestCase):
    def test_extracts_metadata_and_90_cell_horse_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "target.html"
            path.write_text(make_fixture(), encoding="utf-8")
            result = extract(path)
        race = result["race"]
        self.assertEqual(race["date"], "2026-11-01")
        self.assertEqual(race["venue"], "東京")
        self.assertEqual(race["raceNumber"], 12)
        self.assertEqual(race["name"], "テスト特別")
        self.assertEqual(race["surface"], "ダート")
        self.assertEqual(race["distanceM"], 1600)
        self.assertEqual(race["fieldSize"], 6)
        self.assertEqual(race["startTime"], "16:25")
        self.assertEqual(race["weightType"], "ハンデ")
        self.assertEqual(len(result["horses"]), 6)
        self.assertEqual(result["horses"][0]["profile"]["trainer"], "調教師")
        self.assertEqual(len(result["horses"][0]["recentRuns"]), 3)
        self.assertEqual(result["horses"][0]["pedigree"]["sire"], "父馬1")
        self.assertEqual(result["horses"][0]["sourceStyles"]["recentRuns"][0]["passingOrder"], [
            {"backgroundColor": "#FFC0FF", "textColor": None}
        ] * 4)

    def test_fails_if_field_size_disagrees(self):
        fixture = make_fixture().replace("6頭", "7頭")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "target.html"
            path.write_text(fixture, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "fieldSize"):
                extract(path)

if __name__ == "__main__":
    unittest.main()
