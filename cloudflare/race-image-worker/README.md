# 木戸表 レース画像アップロード（Cloudflare R2）

この機能はテストブランチ `feature/race-image-upload-r2` に実装しています。本番サイトにはまだ反映していません。

## 仕様
- 1レースにつき画像1枚。キーは `races/{raceId}/image`。
- 同じレースへの再アップロードで上書き。
- ページからログインなしでアップロード・差し替え・削除。
- PNG / JPEG / WebP、最大8MiB。
- ファイル拡張子やブラウザ申告MIMEだけでなく、先頭バイトで画像形式を検査。
- GET画像は公開閲覧。画像URLを知る人は表示できます。

## 構成
- GitHub Pages: 木戸表画面
- Cloudflare Worker: 画像API
- Cloudflare R2: 画像保存

## Cloudflare側の設定
1. Cloudflareアカウントを作成。
2. R2 Standard bucket `kido-race-images` を作成。
3. Worker `kido-race-image-api` をデプロイ。
4. R2 binding名 `IMAGES` をbucket `kido-race-images` に紐付け。
5. `ALLOWED_ORIGIN` を実際の木戸表URLのoriginに設定。現在の設定値は `https://kidokira-apogee.github.io`。
6. Workerの公開URLを取得し、`index.html` の `window.KIDO_IMAGE_API_BASE` に設定。
7. テストブランチをPagesのプレビュー等で確認後、本番反映する。

## API
- `GET /image/{raceId}`: 画像取得
- `PUT /upload/{raceId}`: 画像の新規登録・差し替え
- `DELETE /image/{raceId}`: 画像削除

## セキュリティ上の注意
この版はログイン認証を設けず、ブラウザのOriginを確認する簡易運用です。CORS/Origin確認は通常のブラウザ経由の誤操作や他サイトからの呼び出しを抑える助けにはなりますが、認証ではありません。HTTPクライアント等でOriginを偽装する第三者まで排除するものではありません。サイトを知る人がAPIを直接呼ぶリスクは残ります。ユーザーが限定されている個人用途を前提とした仕様です。
画像の形式・サイズ検査は行いますが、公開前に実際の運用環境でアップロード・表示・差し替え・削除を確認してください。

## 料金
R2/Workersの料金や無料枠は変更される可能性があります。無料枠を超えた際の請求をこのコードだけで完全に防ぐことはできません。Cloudflareの現在の料金ページとアカウントの課金設定を確認してください。
