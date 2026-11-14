# 木戸表 レース画像アップロード（Cloudflare R2）

この機能はテストブランチ用です。本番サイトではまだ有効化されていません。

## 構成
- GitHub Pages: 木戸表画面
- Cloudflare Worker: 認証と画像アップロードAPI
- Cloudflare R2: 画像保存
- 1レースにつき1画像。キーは `races/{raceId}/image`。同じレースへの再アップロードで差し替えます。

## 無料枠
R2 Standardの無料枠は月10GB-month、Class A 100万操作/月、Class B 1,000万操作/月、インターネット向け転送無料。Workers Freeには日次リクエスト上限等があります。無料枠超過時に有料へ移行しないよう、Cloudflare側で課金設定・利用上限を必ず確認してください。無料枠を超えた場合に課金ゼロを技術的に保証する仕組みではありません。

## Cloudflare側で必要な作業
1. Cloudflareアカウントを作成し、R2 Standard bucket `kido-race-images` を作成。
2. Workerをデプロイし、R2 binding名 `IMAGES` を設定。
3. `ADMIN_PASSWORD` と十分に長いランダムな `TOKEN_SECRET` をWorker secretsに登録。
4. `ALLOWED_ORIGIN` を実際の木戸表公開URLのoriginに設定（現在の仮値はGitHub Pages標準URL）。
5. WorkerをデプロイしてURLを取得。
6. `index.html` の `window.KIDO_IMAGE_API_BASE` にWorker URLを設定。
7. テスト環境でアップロード・再読込・別レース非表示・差し替えを検証。

## API
- `POST /login` JSON `{"password":"..."}` → 8時間有効の署名トークン
- `PUT /upload/{raceId}` Bearerトークン + PNG/JPEG/WebP、最大8MB
- `GET /image/{raceId}` 公開画像取得

## 注意
- 画像GETは公開閲覧用。機密画像を置かないこと。
- アップロード画面はWorker URLが空なら表示されない。
- 本実装は最初の検証用。削除UI、画像のEXIF除去、ファイル内容のマジックバイト検査、レート制限、ログ監視は未実装。
- Cloudflareのアカウント作成・secret設定・Workerデプロイ・実機確認はこのリポジトリ変更だけでは完了しません。
