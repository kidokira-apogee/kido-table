#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""木戸表 Excel一括変換エンジン v0.1

TARGET出力ExcelからレースJSONを生成し、基本的な欠落・重複を検査する。
DATA領域は sourceData として原表値を保持する。DATAタブへの意味付け変換は
仕様が確定するまで推測せず、公開工程では未対応として扱う。
"""
from __future__ import annotations
import argparse, json, re
from pathlib import Path
import openpyxl

VENUE = {"札":"札幌","函":"函館","福":"福島","新":"新潟","東":"東京","中":"中山","名":"中京","京":"京都","阪":"阪神"}
VENUE_SLUG = {"東京":"tokyo","京都":"kyoto","中山":"nakayama","阪神":"hanshin","中京":"chukyo","札幌":"sapporo","函館":"hakodate","福島":"fukushima","新潟":"niigata"}
RUN_STARTS = [8, 34, 60]

def value(ws, row, col):
    x = ws.cell(row, col).value
    if x is None: return ""
    if isinstance(x, float) and x.is_integer(): return str(int(x))
    return str(x).strip()

def style(cell):
    background = None
    fill = cell.fill
    if fill and fill.fill_type == "solid":
        fg = fill.fgColor
        if fg.type == "rgb" and fg.rgb:
            rgb = fg.rgb[-6:].upper()
            if rgb not in ("E8E8C8", "C0C0C0"):
                r, g, b = int(rgb[:2],16), int(rgb[2:4],16), int(rgb[4:6],16)
                if not (r == g == b): background = "#" + rgb
        elif fg.type == "theme":
            background = {"theme": fg.theme, "tint": fg.tint}
    text_color = None
    color = cell.font.color
    if color:
        if color.type == "rgb" and color.rgb: text_color = "#" + color.rgb[-6:].upper()
        elif color.type == "theme": text_color = {"theme": color.theme, "tint": color.tint}
    return {"textColor": text_color, "backgroundColor": background}

def race_date(header):
    m = re.search(r"(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日", header)
    if not m: raise ValueError("A1から開催日を読み取れません")
    return f"{int(m[1]):04d}-{int(m[2]):02d}-{int(m[3]):02d}"

def race_header(header):
    m = re.search(r"【\s*([０-９0-9]{1,2})\s*Ｒ】\s*(.*)", header)
    if not m: raise ValueError("A2からレース番号・レース名を読み取れません")
    digits = m[1].translate(str.maketrans("０１２３４５６７８９","0123456789"))
    return int(digits), m[2].strip()

def venue_name(header):
    m = re.search(r"\d+回([^\d]+?)\d+日目", header)
    return m[1].strip() if m else ""

def race_condition(text):
    m = re.search(r"(芝|ダート|ダ)\s*([0-9,]+)\s*m", text)
    return ("芝" if m and m[1] == "芝" else "ダート" if m else ""), (int(m[2].replace(",","")) if m else None)

def extract_sheet(ws, workbook_name):
    a1, a2, a3 = value(ws,1,1), value(ws,2,1), value(ws,3,1)
    if not a1 or not a2: return None
    dt = race_date(a1); race_no, title = race_header(a2)
    venue = venue_name(a1); surface, distance = race_condition(a3)
    horses = []
    for row in range(5, min(ws.max_row,22)+1):
        no = ws.cell(row,1).value
        name = value(ws,row,2)
        if not isinstance(no,(int,float)) or not name or not isinstance(ws.cell(row,2).value,str): continue
        n = int(no)
        profile = {"horseNumber":str(n),"horseName":name,"sexAge":value(ws,row,3),
                   "handicapWeight":value(ws,row,4),"jockeyRaw":value(ws,row,5).lstrip("*"),
                   "jockey":value(ws,row,5).lstrip("*"),"affiliation":value(ws,row,6),"trainer":value(ws,row,7)}
        runs, run_styles = [], []
        for ix,start in enumerate(RUN_STARTS):
            get = lambda col: value(ws,row,col)
            runs.append({"label":["前走","2走前","3走前"][ix],"dateRaw":get(start),"courseRaw":get(start+1),
                "ageClass":get(start+2),"class":get(start+3),"raceName":get(start+4),"weight":get(start+5),
                "jockey":get(start+6),"bodyWeight":get(start+7),"bodyWeightChange":get(start+8),"going":get(start+9),
                "fieldSize":get(start+11),"horseNumber":get(start+12),"popularity":get(start+13),"finish":get(start+14),
                "margin":get(start+15),"index":get(start+16),"last3F":get(start+17),"last3FRank":get(start+18),
                "interval":get(start+19),"blinkers":get(start+20),"passingOrder":[get(start+21+i) for i in range(4)],
                "runningStyleRaw":get(start+25)})
            keys = ["dateRaw","courseRaw","ageClass","class","raceName","weight","jockey","bodyWeight","bodyWeightChange","going",
                    "fieldSize","horseNumber","popularity","finish","margin","index","last3F","last3FRank","interval","blinkers","runningStyleRaw"]
            cols = [start,start+1,start+2,start+3,start+4,start+5,start+6,start+7,start+8,start+9,start+11,start+12,start+13,start+14,start+15,start+16,start+17,start+18,start+19,start+20,start+25]
            run_styles.append({**{k:style(ws.cell(row,c)) for k,c in zip(keys,cols)},
                               "passingOrder":[style(ws.cell(row,start+21+i)) for i in range(4)]})
        pedigree = {"sire":value(ws,row,86),"dam":value(ws,row,87),"damsire":value(ws,row,88),
                    "sourceStyles":{"sire":style(ws.cell(row,86)),"dam":style(ws.cell(row,87)),"damsire":style(ws.cell(row,88))}}
        horses.append({"horseNumber":n,"frameNumber":(n-1)//2+1,"horseName":name,"profile":profile,
                       "pedigree":pedigree,"recentRuns":runs,"sourceStyles":{"profile":{
                       "horseName":style(ws.cell(row,2)),"sexAge":style(ws.cell(row,3)),
                       "handicapWeight":style(ws.cell(row,4)),"jockeyRaw":style(ws.cell(row,5)),
                       "trainer":style(ws.cell(row,7))},"recentRuns":run_styles}})
    if not horses: raise ValueError(f"{ws.title}: 出走馬を検出できません")
    nums = [h["horseNumber"] for h in horses]
    if len(nums) != len(set(nums)): raise ValueError(f"{ws.title}: 馬番重複")
    if nums != list(range(1,len(nums)+1)): raise ValueError(f"{ws.title}: 馬番欠落・順序異常 {nums}")
    # コメント：馬番行に続く今回コメント、前走ラベルの3行後を取得
    for row in range(130,ws.max_row+1):
        no = ws.cell(row,1).value
        if not isinstance(no,(int,float)): continue
        n = int(no); title_cell = value(ws,row,2)
        current = value(ws,row+1,2)
        previous = ""
        for rr in range(row+2,min(row+7,ws.max_row+1)):
            if value(ws,rr,2) == "前走":
                previous = value(ws,rr+3,2); break
        strip = lambda s: re.sub(r"（[^（）]*記者）$","",s).strip()
        horse = next((h for h in horses if h["horseNumber"] == n),None)
        if horse:
            horse["comments"] = {"current":{"text":strip(current),"isIchioshi":"イチ押し" in title_cell},
                                 "previousRun":{"text":strip(previous)} if previous else {}}
    # DATA原表を値のまま保存。定義のない項目は推測でWeb項目に変換しない。
    raw_data = []
    for rr in range(30,min(ws.max_row,121)+1):
        vals = [ws.cell(rr,cc).value for cc in range(1,ws.max_column+1)]
        if any(x is not None for x in vals): raw_data.append({"row":rr,"values":vals})
    slug = VENUE_SLUG.get(venue,venue)
    return {"schemaVersion":"2.0.0","race":{"id":f"{dt}-{slug}-{race_no:02d}","date":dt,
        "venue":venue,"raceNumber":race_no,"name":title,"surface":surface,"distanceM":distance,
        "fieldSize":len(horses),"classLabel":a3,"courseLabel":a3},
        "status":{"sample":False,"complete":True,"sourceWorkbook":workbook_name},
        "horses":horses,"sourceData":{"excelRows":raw_data,
        "note":"DATA原表値を保持。表示用DATAタブへの変換定義は別途確定が必要。"}}

def main():
    ap=argparse.ArgumentParser(description="木戸表 Excel一括変換エンジン")
    ap.add_argument("workbook"); ap.add_argument("--out",default="dist")
    args=ap.parse_args()
    wb=openpyxl.load_workbook(args.workbook,data_only=True)
    races=[r for ws in wb.worksheets if (r:=extract_sheet(ws,Path(args.workbook).name))]
    if not races: raise SystemExit("レースを検出できません")
    # 同一日・同一会場・同一Rの重複を拒否
    ids=[r["race"]["id"] for r in races]
    if len(ids)!=len(set(ids)): raise SystemExit("レースID重複")
    out=Path(args.out); out.mkdir(parents=True,exist_ok=True); manifest=[]
    for race in races:
        rid=race["race"]["id"]; filename=rid+".json"
        (out/filename).write_text(json.dumps(race,ensure_ascii=False,indent=2),encoding="utf-8")
        x=race["race"]
        manifest.append({"id":rid,"file":filename,"date":x["date"],"dateLabel":x["date"],
                         "venue":x["venue"],"raceNo":x["raceNumber"],"title":x["name"],
                         "distance":x.get("courseLabel",""),"classLabel":x.get("classLabel",""),
                         "status":"staged","horseCount":x["fieldSize"]})
    (out/"index.json").write_text(json.dumps({"schemaVersion":1,"races":manifest},ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"raceCount":len(races),"horseCounts":[r["race"]["fieldSize"] for r in races],
                      "output":str(out),"publicationReady":False,
                      "reason":"DATAタブ変換定義と公開アダプター接続が未完了"},ensure_ascii=False))
if __name__=="__main__": main()
