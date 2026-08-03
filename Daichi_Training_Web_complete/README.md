# D-log v3

## 追加・変更点
- トップに「今日」「今週・来週」「基本ルーティン」を表示
- 予定を画面上で変更し、Notionトップページへ同期
- トレーニング中に種目を自由追加・削除
- セット追加、完了セットのみNotionへ保存
- アプリ内タイマーは初期OFF。Apple Watch運用を前提に開始・終了・セット完了時刻のみ記録
- ブラウザのlocalStorageへ自動保存

## 導入
1. ZIPを展開し、GitHubの既存リポジトリへ中身を上書き
2. Vercelで再デプロイ
3. Environment Variablesに `.env.example` の3項目を登録
4. Notion integrationをログDBとトップページへ接続（Shareから招待）

## Notion DBの必要プロパティ
`種目`(Title), `部位`(Select), `セット`(Number), `重量(kg)`(Number), `回数`(Number), `RIR`(Number), `日付`(Date)

## 注意
初期予定の日付は `lib/data.js` に入っています。ホーム上で変更した内容は端末内に保存されます。
Notion同期ボタンは現状、トップページ末尾へ予定ブロックを追加します。既存ブロックの自動置換はNotion APIの制約上行っていません。
