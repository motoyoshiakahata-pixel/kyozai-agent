# 教材作成AIエージェント

高校公民科（「公共」）の教員が、Googleドライブに保存済みの教材（教科書PDF・過去問等）を参照しながら、AIエージェントに指示して新しい教材（問題・プリント等）を作成し、Googleドライブの専用フォルダに保存できるWebアプリケーションです。

開発者本人（教員1名）のみが使用する想定で、マルチユーザー対応やデータベースは導入せず、Googleドライブのみでデータを完結させます。

## 想定アーキテクチャ

フロントエンド（Next.js, Vercelホスティング）→ バックエンド（Next.js API Routes）→ Anthropic API（mcp_serversにGoogle DriveのMCPサーバーURLを渡す）→ Google OAuth認証

## セットアップ

```bash
npm install
cp .env.example .env.local
```

`.env.local` に以下を設定してください。

- `ANTHROPIC_API_KEY`: Anthropic APIキー
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google OAuthクライアント情報
- `GOOGLE_REDIRECT_URI`: OAuthコールバックURL（例: `http://localhost:3000/api/auth/callback`）
- `AUTH_SECRET`: セッション/トークン暗号化用シークレット（`openssl rand -base64 32` 等で生成）
- `GOOGLE_DRIVE_MCP_SERVER_URL`: Google Drive MCPサーバーのURL

### Google OAuthクライアントの準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 「APIとサービス」→「認証情報」からOAuth 2.0 クライアントID（ウェブアプリケーション）を作成
3. 承認済みのリダイレクトURIに `GOOGLE_REDIRECT_URI` と同じ値を登録（本番環境用URLも追加）
4. OAuth同意画面でテストユーザーとして開発者本人のGoogleアカウントを追加（マルチユーザー対応不要のため「テスト」モードのままでよい）
5. Google Drive APIを有効化

### 認証の仕組み

単一ユーザーでの利用に絞り、NextAuth等の汎用認証ライブラリは使わず、Route Handler + `jose`によるJWTセッションCookieで最小限のGoogle OAuthを実装しています（`src/lib/google-oauth.ts`, `src/lib/session.ts`）。

- `/api/auth/login`: Google認証画面へリダイレクト
- `/api/auth/callback`: 認可コードをトークンに交換し、暗号化したセッションをCookieに保存
- `/api/auth/logout`: セッションCookieを削除

### 教材作成チャット（Anthropic API連携）

`/api/chat` がAnthropic APIの[MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)（beta）を使い、`mcp_servers` にGoogle Drive MCPサーバーのURLとログイン中ユーザーのGoogleアクセストークンを渡してリクエストします。モデルはコスト管理（Claude Proのプログラム利用クレジット月20ドル相当）を踏まえ `claude-sonnet-5`・`effort: medium` を既定にしています（`src/lib/anthropic.ts`）。システムプロンプト（参照フォルダ・出力形式・保存先の指示）は `src/lib/prompts.ts` にまとめています。

`GOOGLE_DRIVE_MCP_SERVER_URL` にはGoogle Drive操作用のMCPサーバー（Streamable HTTP）のURLを設定してください。

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
