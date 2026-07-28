# Daichi Training Web

iPhoneのSafariで使うトレーニング入力アプリです。Notionトークンはブラウザへ渡さず、Vercelのサーバー側だけで使用します。

## デプロイ

1. このフォルダをMacで開く
2. `DEPLOY.command` を実行
3. Vercelへログインし、そのままデプロイ
4. Vercelのプロジェクト画面 → Settings → Environment Variables
5. 以下の6項目を登録

- `NOTION_TOKEN`
- `NOTION_MASTER_DS`
- `NOTION_WORKOUT_DS`
- `NOTION_LOG_DS`
- `NOTION_SUMMARY_DS`
- `NOTION_PR_DS`

各DS IDは、以前作成された `notion_ids.json` の `data_source_id` を使用します。

対応関係：
- NOTION_MASTER_DS = 種目マスター
- NOTION_WORKOUT_DS = Workout
- NOTION_LOG_DS = Exercise Log
- NOTION_SUMMARY_DS = Exercise Summary
- NOTION_PR_DS = PR Log

6. 環境変数登録後、`DEPLOY.command` をもう一度実行
7. 表示されたURLをiPhoneのSafariで開く
8. Safari共有ボタン →「ホーム画面に追加」

## 使い方

1. 胸・背中・肩・腕・脚を選ぶ
2. 前回記録と予定メニューを確認
3. 「○○ Dayを開始」
4. 各セットの重量・回数・RIRを入力
5. 右端の○を押してセット完了
6. 最後に「トレ終了・記録を同期」

未完了セットは、前回記録とPRの集計対象になりません。
