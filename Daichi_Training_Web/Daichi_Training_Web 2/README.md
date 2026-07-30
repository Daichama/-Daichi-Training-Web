# Daichi Training Web v2

Notion連携のスマホ用トレーニング記録アプリです。Notionトークンはブラウザへ渡さず、Vercelのサーバー側だけで使用します。

## v2の機能

- 前回の全セットを表示
- 前回重量・回数を各セットへ自動入力
- 前回セットをワンタップで再入力
- RIR 0〜4のボタン入力
- セット完了時に種目別の休憩タイマーを自動開始
- 総ボリューム・種目別ボリューム・完了セット数を表示
- 前回セットとの差分を表示
- 最高重量・推定1RM・セットVolumeを基準にPR表示
- セットごとにNotionへ保存
- トレ終了時に前回記録・PR Logを同期し、Workoutを完了扱いに更新

## GitHubへの反映

このフォルダの中身を、既存GitHubリポジトリの `Daichi_Training_Web` 内へ上書きしてCommitしてください。VercelがGitHub連携済みなら自動で再デプロイされます。

## Vercel環境変数

既存プロジェクトに以下が登録済みであれば変更不要です。

- `NOTION_TOKEN`
- `NOTION_MASTER_DS`
- `NOTION_WORKOUT_DS`
- `NOTION_LOG_DS`
- `NOTION_SUMMARY_DS`
- `NOTION_PR_DS`

## Notionで使用する主なプロパティ

既存のTraining OSで作成したプロパティ名をそのまま使用します。

- 種目マスター：種目、部位、順番、標準セット、目標レップ、開始重量、休憩秒、フォーム・運用メモ
- Exercise Summary：種目リンク、前回記録、最高重量kg、最高推定1RM、最高セットVolume
- Exercise Log：ログ、日付、Workout、種目、部位、セット番号、セット種別、重量kg、回数、RIR、ボリューム、推定1RM、完了、メモ

## 注意

休憩タイマーのバイブは端末・ブラウザの対応状況に依存します。iPhone Safariでは画面表示中の利用が最も安定します。
