# D Training v5.0

## 変更点
- D v1.0ロゴと新トップ画面
- 前回記録をExercise Logの最新完了記録から取得（Master/Summaryの前回値は不使用）
- RIR：未入力 / 0 / 1 / 2、初期値1
- 種目ごとのセット数を−/＋で変更
- 予定はNotion管理のみ（固定スケジュールなし）
- 完了セットのみ保存、タイマー・編集可能な日付/時刻・Notion Dashboardは維持

## Vercel
従来の環境変数をそのまま使用できます。予定DBを追加する場合は `NOTION_SCHEDULE_DS` を設定してください。
