# 教材作成AIエージェント

高校公民科（「公共」）の教員が、Googleドライブに保存済みの教材（教科書PDF・過去問等）を参照しながら、AIエージェントに指示して新しい教材（問題・プリント等）を作成し、Googleドライブの専用フォルダに保存できるWebアプリケーションです。

開発者本人（教員1名）のみが使用する想定で、マルチユーザー対応やデータベースは導入せず、Googleドライブのみでデータを完結させます。

## 想定アーキテクチャ

フロントエンド（Next.js, Vercelホスティング）→ バックエンド（Next.js API Routes）→ Anthropic API（Claude Sonnet 4.6、mcp_serversにGoogle DriveのMCPサーバーURLを渡す）→ Google OAuth認証

## セットアップ

```bash
npm install
cp .env.example .env.local
```

`.env.local` に以下を設定してください。

- `ANTHROPIC_API_KEY`: Anthropic APIキー
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google OAuthクライアント情報
- `GOOGLE_REDIRECT_URI`: OAuthコールバックURL
- `AUTH_SECRET`: セッション/トークン暗号化用シークレット
- `GOOGLE_DRIVE_MCP_SERVER_URL`: Google Drive MCPサーバーのURL

## 開発サーバーの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開いて確認できます。

## 技術スタック

- Next.js (App Router) / TypeScript
- Tailwind CSS
- Anthropic API (Claude)
- Google OAuth / Google Drive API (MCP経由)

## デプロイ

Vercel無料枠でのホスティングを想定しています。
