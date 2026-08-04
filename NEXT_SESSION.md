# 次のセッションへの引き継ぎメモ

このファイルは、次に作業を再開するときのための一時的なメモです。内容が古くなったら削除して構いません。

## 今どこまで進んでいるか

コードは `claude/high-school-textbook-agent-rrkqnc` ブランチにあり、GitHubにプッシュ済み。ここまでに実装したもの:

- Googleドライブの参照フォルダ（教科書PDF・資料集PDF・共通テスト関連・問題モデルフォルダ）の定義と疎通確認
- 教科書・資料集PDFのページ単位の読み取り（出典のページ番号を正確に示すため）
- 共通テスト型の出題パターンA〜Eの自動選択
- 承認ゲート（プラン提示 → 問題案 → 保存）と、完成品の問題モデルフォルダへの登録

いずれもビルド・型チェックは通っているが、**Anthropic APIキーとGoogleログインが必要なため、実際の生成動作はまだ未検証**。

## デプロイ状況

Vercelへのデプロイ済み。本番URLは <https://kyozai-agent.vercel.app>。

- Vercelチーム: `007`（Hobby / 無料枠）
- 本番ブランチ（Settings → Environments → Production → Branch Tracking）は
  `claude/high-school-textbook-agent-rrkqnc` に設定済み
- 環境変数は `ANTHROPIC_API_KEY` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
  `AUTH_SECRET` の4つを登録済み（`GOOGLE_REDIRECT_URI`と
  `GOOGLE_DRIVE_MCP_SERVER_URL`はアプリが自動判別するため未設定でよい）

ステップ5でVercelへのログインが失敗していた原因は、GitHubのアカウント違い
（`mcir2329-ctrl` でログインしていた）だった可能性が高い。

## 次にやること

DEPLOY.mdのステップ9（リダイレクトURIの登録）とステップ10（動作確認）を進め、
次を確認する:

1. 参照フォルダ4つがすべて「接続OK」になるか
2. プラン提示 → 問題案 → 保存の流れが通るか
3. 生成された問題の出典ページ・統計の数値が資料集の実物と一致しているか
4. Vercel無料枠の60秒制限に引っかからないか（引っかかる場合は読むページ数を絞るか `CHAT_EFFORT` を下げる）
