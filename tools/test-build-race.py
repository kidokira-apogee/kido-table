#!/usr/bin/env python3
"""End-to-end synthetic pipeline tests for both turf and dirt races."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent


def target_html(surface: str) -> str:
    code = "T" if surface == "芝" else "D"
    rows = []
    for number in range(1, 7):
        name = f"テストホース{number}"
        values = [str(number), name, "牡4", "56", "騎手名", "美浦", "調教師"]
        for run in range(3):
            values.extend([
                f"10.{run + 1}", f"東･{code}16", "３上", "2勝", f"レース{run + 1}",
                "56", "騎手名", "480", "+2", "良", "", "16", str(number),
                "3", "4", "2", "0.2", "85", "36.5", "2", "4", "2", "2", "2", "2", "先"
            ])
        values.extend([f"父馬{number}", f"母馬{number}", f"母父{number}",
                       "ロイヤルチャージャー系", "ナスルーラ系"])
        assert len(values) == 90
        rows.append("<TR>" + "".join(f"<TD>{value}</TD>" for value in values) + "</TR>")
    return f"""<HTML><HEAD><TITLE>出馬表・東京12R テスト特別</TITLE></HEAD><BODY>
2026年11月 1日(日)　<B>4回東京11日目</B>　6頭　[16:25発走]<BR>
<B>【１２Ｒ】 テスト特別 </B><BR>
３歳以上・２勝クラス(ハンデ)(混)[指定]　<B>{surface}1600m</B>
<TABLE><TR><TH>見出し</TH></TR>{''.join(rows)}</TABLE></BODY></HTML>"""


def date2_text(surface: str) -> str:
    course = f"東京{surface}1600m"
    all_course = f"全場{surface}1600m"
    slope = f"坂有{surface}"
    blocks = []
    for number in range(1, 7):
        frame = (number + 1) // 2
        blocks.extend([
            f"{frame}\t{number}\t",
            "--",
            f"父馬{number}",
            f"テストホース{number}",
            f"母馬{number}",
            f"母父{number}",
            "5.0 1人気",
            "全着\t1\t0\t0\t0",
            "全芝\t1\t0\t0\t0",
            "全ダ\t0\t0\t0\t0",
            "東京\t1\t0\t0\t0",
            "1400m-1600m\t1\t0\t0\t0",
            f"{course}\t1\t0\t0\t0",
            f"{all_course}\t1\t0\t0\t0",
            "当距離\t東京 34.5 ①",
            "芝最高\t東京 34.5 ①",
            "ダ最高\t－",
            "中2週",
            "1\t0\t0\t0",
            "9月～11月",
            "1\t0\t0\t0",
            f"{slope}\t1\t0\t0\t0",
            "平坦" + surface + "\t0\t0\t0\t0",
            "重不" + surface + "\t0\t0\t0\t0",
            "Sペ\t0\t0\t0\t0",
            "Hペ\t1\t0\t0\t0",
            "左回\t1\t0\t0\t0",
            "右回\t0\t0\t0\t0",
            "９頭下\t0\t0\t0\t0",
            "10頭上\t1\t0\t0\t0",
            "３人上\t1\t0\t0\t0",
            "４人下\t0\t0\t0\t0",
            "内枠\t1\t0\t0\t0",
            "中枠\t0\t0\t0\t0",
            "外枠\t0\t0\t0\t0",
            f"{frame}枠\t1\t0\t0\t0",
            "連対体重\t450～454",
            "連対距離\t1400～1600",
            "連対平均\t1500m",
            "出遅れ率\t25%",
        ])
    return "\n".join(blocks) + "\n"


def tospo_data():
    return {"horses": [
        {
            "horseNumber": number,
            "horseName": f"テストホース{number}",
            "currentComment": f"今回コメント{number}",
            "previousRunComment": f"前走コメント{number}",
            "isIchioshi": number == 2,
        }
        for number in range(1, 7)
    ]}


class BuildRacePipelineTests(unittest.TestCase):
    def run_surface(self, surface: str):
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            target = temp / "target.html"
            date2 = temp / "date2.txt"
            tospo = temp / "tospo.json"
            output = temp / "race.json"
            target.write_text(target_html(surface), encoding="utf-8")
            date2.write_text(date2_text(surface), encoding="utf-8")
            tospo.write_text(json.dumps(tospo_data(), ensure_ascii=False), encoding="utf-8")

            subprocess.run([
                sys.executable, str(TOOLS / "build-race.py"),
                "--target-html", str(target),
                "--date2-text", str(date2),
                "--tospo-normalized", str(tospo),
                "--output", str(output),
            ], check=True, cwd=ROOT)

            result = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(result["race"]["surface"], surface)
            self.assertEqual(result["race"]["distanceM"], 1600)
            self.assertEqual(len(result["horses"]), 6)
            self.assertEqual([horse["frameNumber"] for horse in result["horses"]], [1, 1, 2, 2, 3, 3])
            self.assertEqual(result["horses"][0]["dataTabs"]["detail"]["overall"][-1]["label"], "東京")
            self.assertEqual(result["horses"][0]["dataTabs"]["distanceCourse"]["courseRecords"][0]["label"], f"東京{surface}1600m")
            self.assertEqual(result["horses"][1]["comments"]["current"]["isIchioshi"], True)
            self.assertNotIn("isIchioshi", result["horses"][1]["comments"]["previousRun"])
            self.assertNotIn("html", result["render"])
            subprocess.run([
                "node", str(TOOLS / "validate-race.mjs"), str(output)
            ], check=True, cwd=ROOT)

    def test_end_to_end_turf(self):
        self.run_surface("芝")

    def test_end_to_end_dirt(self):
        self.run_surface("ダート")


if __name__ == "__main__":
    unittest.main()
