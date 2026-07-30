# Daichi Training Web v3

Notionを記録先に使う、スマホ向けトレーニング入力アプリです。

## v3の動作

- 部位・種目を読み込むだけではNotionに記録を作りません。
- 「Dayを開始」後の重量・回数・RIR・完了状態はブラウザ内に保存されます。
- ページを閉じても、未保存Workoutを同じブラウザで復元できます。
- 「トレ終了・記録を同期」を押した時だけWorkoutと完了セットをNotionへ保存します。
- 保存後、Exercise SummaryとPR Logを自動更新します。
- 未完了セットはNotionへ保存しません。

## Vercel環境変数

- NOTION_TOKEN
- NOTION_MASTER_DS
- NOTION_WORKOUT_DS
- NOTION_LOG_DS
- NOTION_SUMMARY_DS
- NOTION_PR_DS

既存の環境変数はそのまま使用できます。

## GitHub Webでの反映

このZIP内の `Daichi_Training_Web_complete` フォルダの中身を、リポジトリの `Daichi_Training_Web` フォルダへ上書きしてください。
