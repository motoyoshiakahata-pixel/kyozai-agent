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

チャット画面には出力形式に加えて「出題設定」（問題数・難易度・出題形式・解答/解説を別紙にするか）を選択できます。選択内容は`materialOptions`としてリクエストに含まれ、`buildSystemPrompt`（`src/lib/prompts.ts`）がシステムプロンプトに反映します。作成される教材には、問題数などの指定の有無にかかわらず必ず解答・解説を付ける方針にしています。

### 作成履歴パネル

`/api/materials` がGoogle Drive API（v3）を直接呼び出し、マイドライブ直下の「作成教材」フォルダ内のファイルを作成日時順に取得します（`src/lib/google-drive.ts`）。チャット画面下の作成履歴パネル（`src/components/MaterialsPanel.tsx`）に表示され、教材作成が完了するたびに自動更新されます。

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

## デプロイ（Vercel無料枠）

1. GitHubリポジトリをVercelにインポートする（Frameworkは自動検出されるはず）
2. Vercelプロジェクトの Settings → Environment Variables に `.env.example` と同じ変数を設定する
   - `GOOGLE_REDIRECT_URI` は本番URL（例: `https://<your-app>.vercel.app/api/auth/callback`）にする
3. Google Cloud ConsoleのOAuthクライアントの「承認済みのリダイレクトURI」に、本番の `GOOGLE_REDIRECT_URI` を追加する
4. デプロイ後、本番URLにアクセスしてGoogleログイン〜教材作成チャットが動作することを確認する

### 無料（Hobby）プランの制約

- Serverless Functionsの実行時間には上限があるため、`/api/chat` には `maxDuration = 60`（秒）を設定しています。教材生成に時間がかかりGoogleドライブ操作を伴う場合、60秒を超えるとタイムアウトする可能性があります。頻繁にタイムアウトする場合はVercelのProプランへの変更や、生成指示を分割する運用を検討してください。
- Anthropic APIの呼び出しはClaude Proのプログラム利用クレジット（月20ドル相当）の範囲内を想定しており、追加課金は有効化していません。想定より頻度・分量が多い場合は`src/lib/anthropic.ts`の`CHAT_EFFORT`（既定: `medium`）を`low`に下げるなどしてコストを調整してください。
