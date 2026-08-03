# D-log v6.1.3

- アプリアイコンを全面ブラック背景に変更
- 外周の余白・二重枠を削除
- Dロゴを少し小さく中央配置
- PWA / Apple Touch Icon / favicon / Next.js iconを統一

# D-log v6.1.2

- アプリアイコンを指定画像へ完全差し替え
- Next.js app/icon.png / app/apple-icon.png を追加
- PWA manifest・Apple Touch Icon・faviconを統一
- バージョン付きファイル名で旧アイコンのキャッシュを回避
- v6.1.1の機能は維持

※ iPhoneのホーム画面に旧アイコンが残る場合は、一度ホーム画面からD-logを削除してSafariから再追加してください。

# D-log v6.1.4

- 元のv6.1.3 UIを維持
- トップページに今週の予定を表示し、今日をハイライト
- `NOTION_SCHEDULE_DS` が設定されている場合はNotionのSchedule DBから予定を取得
- トレーニング開始後にも種目追加が可能（追加時にセット入力欄も生成）
- 休憩タイマーは初期OFF。Apple Watch等を使う運用を基本とし、必要時のみON
