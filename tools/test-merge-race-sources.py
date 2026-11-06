#!/usr/bin/env python3
"""Contract tests for strict source merge; synthetic data only."""
import importlib.util
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name("merge-race-sources.py")
SPEC = importlib.util.spec_from_file_location("merge_race_sources", MODULE)
MERGER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MERGER)


def fixtures():
    target = {
        "race": {
            "id": "test-race", "date": "2026-01-01", "venue": "東京",
            "raceNumber": 1, "name": "テスト", "surface": "芝",
            "distanceM": 1600, "direction": "左", "fieldSize": 6,
            "metadataSource": "① TARGET"
        },
        "horses": []
    }
    date2 = {"horses": []}
    tospo = {"horses": []}
    for n in range(1, 7):
        name = f"テスト馬{n}"
        target["horses"].append({
            "horseNumber": n, "frameNumber": None, "horseName": name,
            "profile": {"sexAge": "牡3"}, "pedigree": {}, "recentRuns": []
        })
        date2["horses"].append({
            "horseNumber": n, "frameNumber": (n + 1) // 2, "horseName": name,
            "topSummary": {"allRecord": {"label": "全着", "record": ["1","0","0","0"]}},
            "dataTabs": {"detail": {}, "distanceCourse": {}, "conditions": {}, "frameAndTop2": {}}
        })
        tospo["horses"].append({
            "horseNumber": n, "horseName": name,
            "currentComment": f"今回コメント{n}", "previousRunComment": f"前走コメント{n}",
            "isIchioshi": n == 2
        })
    return target, date2, tospo


class MergeContractTests(unittest.TestCase):
    def test_merge_keeps_target_race_metadata_and_source_roles(self):
        target, date2, tospo = fixtures()
        result = MERGER.merge(target, date2, tospo)
        self.assertEqual(result["race"], target["race"])
        self.assertEqual(result["render"], {"layoutId": "tokyo9-production-locked", "preserveSourceColors": True})
        self.assertEqual(len(result["horses"]), 6)
        self.assertEqual(result["sourceAudit"]["ichioshiHorseNumbers"], [2])
        self.assertEqual(result["horses"][1]["comments"]["current"]["isIchioshi"], True)
        self.assertEqual(result["horses"][1]["frameNumber"], 1)
        self.assertNotIn("isIchioshi", result["horses"][1]["comments"]["previousRun"])

    def test_rejects_horse_number_set_mismatch(self):
        target, date2, tospo = fixtures()
        date2["horses"].pop()
        with self.assertRaisesRegex(ValueError, "馬番集合不一致"):
            MERGER.merge(target, date2, tospo)

    def test_rejects_horse_name_mismatch(self):
        target, date2, tospo = fixtures()
        tospo["horses"][0]["horseName"] = "別の馬"
        with self.assertRaisesRegex(ValueError, "馬名不一致"):
            MERGER.merge(target, date2, tospo)

    def test_rejects_non_target_race_metadata_authority(self):
        target, date2, tospo = fixtures()
        target["race"]["metadataSource"] = "② DATE2"
        with self.assertRaisesRegex(ValueError, "① TARGET"):
            MERGER.merge(target, date2, tospo)

    def test_allows_missing_previous_comment_without_placeholder(self):
        target, date2, tospo = fixtures()
        tospo["horses"][0]["previousRunComment"] = None
        result = MERGER.merge(target, date2, tospo)
        comments = result["horses"][0]["comments"]
        self.assertEqual(comments["current"]["text"], "今回コメント1")
        self.assertEqual(comments["previousRun"], {})

    def test_allows_missing_current_comment_and_disables_ichioshi(self):
        target, date2, tospo = fixtures()
        tospo["horses"][0]["currentComment"] = None
        tospo["horses"][0]["isIchioshi"] = True
        result = MERGER.merge(target, date2, tospo)
        comments = result["horses"][0]["comments"]
        self.assertEqual(comments["current"], {})
        self.assertEqual(comments["previousRun"]["text"], "前走コメント1")
        self.assertFalse(comments["current"].get("isIchioshi", False))


    def test_allows_both_comments_missing(self):
        target, date2, tospo = fixtures()
        tospo["horses"][0]["currentComment"] = None
        tospo["horses"][0]["previousRunComment"] = None
        tospo["horses"][0]["isIchioshi"] = True
        result = MERGER.merge(target, date2, tospo)
        comments = result["horses"][0]["comments"]
        self.assertEqual(comments, {"current": {}, "previousRun": {}})
        self.assertFalse(comments["current"].get("isIchioshi", False))
        self.assertEqual(result["sourceAudit"]["ichioshiHorseNumbers"], [2])

    def test_rejects_invalid_comment_type(self):
        target, date2, tospo = fixtures()
        tospo["horses"][0]["currentComment"] = 123
        with self.assertRaisesRegex(ValueError, "今回コメントの形式が不正"):
            MERGER.merge(target, date2, tospo)


if __name__ == "__main__":
    unittest.main()
