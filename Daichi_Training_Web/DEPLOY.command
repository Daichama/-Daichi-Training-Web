#!/bin/bash
set -e
cd "$(dirname "$0")"
clear

echo "=== Daichi Training Web デプロイ ==="
echo
echo "Vercelへのログイン画面が開きます。"
echo "初回デプロイ後、表示されたVercelプロジェクトで環境変数を登録してください。"
echo
npm install
npx vercel --prod
echo
echo "デプロイ完了。環境変数が未登録ならREADMEの6項目をVercelへ登録後、もう一度このファイルを実行してください。"
read -n 1 -s -r -p "何かキーを押すと閉じます"
