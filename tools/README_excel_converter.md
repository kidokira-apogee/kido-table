# Excel一括変換エンジン（初期版）

## 目的
開催日ごとに受け取ったTARGET出力Excelから、レースJSONと日付・会場・レース単位のindex.jsonを一括生成する。

## 実行
```bash
python -m pip install openpyxl
python tools/kido_excel_converter.py 4_デ－タ.xlsx --out dist
```

## 初期版で処理する内容
- A1〜A3から開催日、会場、レース番号、レース名、条件を取得
- 1シート1レースを想定し、複数シートを一括処理
- 出走馬の基本情報、近3走、血統、セル文字色・背景色、コメントを抽出
- 馬番の欠落・重複、レースID重複を検査
- DATA領域は未定義の意味付けを避け、sourceDataとして元セル値を保持

## 公開について
この初期版は変換エンジンの土台であり、**まだ本番公開には接続しない**。
DATA領域を現行WebのDATAタブ形式へ正しく変換するマッピング、週単位の開催ページ生成、既存rendererとの統合テストが完了していないため、出力indexのstatusはstaged、publicationReadyはfalseとなる。
欠落検査を通っただけで、DATAタブ未変換のJSONを本番公開しない。次段階でDATA項目のマッピングとWeb公開ワークフローを実装する。
