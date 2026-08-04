# 教材作成AIエージェント

高校公民科（「公共」）の教員が、Googleドライブに保存済みの教材（教科書PDF・過去問等）を参照しながら、AIエージェントに指示して新しい教材（問題・プリント等）を作成し、Googleドライブの専用フォルダに保存できるWebアプリケーションです。

開発者本人（教員1名）のみが使用する想定で、マルチユーザー対応やデータベースは導入せず、Googleドライブのみでデータを完結させます。

## 想定アーキテクチャ

フロントエンド（Next.js, Vercelホスティング）→ バックエンド（Next.js API Routes）→ Anthropic API（mcp_serversに、このアプリ自身が内蔵するGoogle Drive MCPサーバーのURLを渡す）→ Google OAuth認証

Google Drive操作用のMCPサーバーは外部サービスではなく、このリポジトリの `/api/mcp` として組み込まれています（詳しくは後述）。そのため、このリポジトリと以下の3つを用意するだけで動かせます。

1. Anthropic APIキー
2. Google CloudのOAuthクライアント（Drive API・Forms APIを有効化したもの）
3. デプロイ先（Vercel無料枠、または自分のPC）

## セットアップ

```bash
npm install
cp .env.example .env.local
```

`.env.local` に以下を設定してください。

- `ANTHROPIC_API_KEY`: Anthropic APIキー（[console.anthropic.com](https://console.anthropic.com/)で発行）
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google OAuthクライアント情報
- `GOOGLE_REDIRECT_URI`: 省略可。OAuthコールバックURL。未設定の場合、アクセス中のURLから自動的に組み立てます（`src/lib/app-url.ts`）。自動判別された値はアプリ画面の「セットアップ状況」カードに表示されるので、それをGoogle Cloud Consoleの「承認済みのリダイレクトURI」に登録してください
- `AUTH_SECRET`: セッション/トークン暗号化用シークレット（`openssl rand -base64 32` 等で生成）
- `GOOGLE_DRIVE_MCP_SERVER_URL`: 省略可。未設定であれば、アクセス中のURL配下の`/api/mcp`（このアプリ内蔵のMCPサーバー）を自動的に使います。ローカル開発など、インターネットから到達できるhttpsのURLがない環境や、外部の別のMCPサーバーを使いたい場合のみ明示的に設定してください。

デプロイの手順は [DEPLOY.md](./DEPLOY.md) に、はじめての方向けの詳しい手順としてまとめています。デプロイ後は、アプリ画面の「セットアップ状況」カードで環境変数の設定漏れと、Google Cloud Consoleに登録すべきリダイレクトURIを確認できます（`src/lib/app-url.ts`, `src/components/SetupStatusCard.tsx`）。

### Google OAuthクライアントの準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 「APIとサービス」→「認証情報」からOAuth 2.0 クライアントID（ウェブアプリケーション）を作成
3. 承認済みのリダイレクトURIに、アプリ画面の「セットアップ状況」カードに表示されるURL（`https://<デプロイ先>/api/auth/callback`）を登録。ローカル開発用には `http://localhost:3000/api/auth/callback` も追加
4. OAuth同意画面でテストユーザーとして開発者本人のGoogleアカウントを追加（マルチユーザー対応不要のため「テスト」モードのままでよい）
5. Google Drive APIとGoogle Forms APIを有効化

### 認証の仕組み

単一ユーザーでの利用に絞り、NextAuth等の汎用認証ライブラリは使わず、Route Handler + `jose`によるJWTセッションCookieで最小限のGoogle OAuthを実装しています（`src/lib/google-oauth.ts`, `src/lib/session.ts`）。

- `/api/auth/login`: Google認証画面へリダイレクト
- `/api/auth/callback`: 認可コードをトークンに交換し、暗号化したセッションをCookieに保存
- `/api/auth/logout`: セッションCookieを削除

### Google Drive MCPサーバー（組み込み）

`/api/mcp`（`src/app/api/mcp/route.ts`）が、このアプリ専用の最小限のGoogle Drive MCPサーバーです。`@modelcontextprotocol/sdk`の`WebStandardStreamableHTTPServerTransport`を使い、セッションを保持しないステートレスなStreamable HTTPサーバーとして実装しています（サーバーレス環境でリクエストごとに別インスタンスで処理されても問題ありません）。

Anthropic APIのMCP connectorは、ログイン中の教員のGoogleアクセストークンを`Authorization: Bearer`ヘッダーに乗せてこのエンドポイントを呼び出します。MCPサーバー自体は認証状態を一切持たず、受け取ったアクセストークンでそのままGoogle Drive APIを呼び出す薄いプロキシです（`src/lib/drive-mcp-tools.ts`, `src/lib/google-drive.ts`）。追加のOAuthスコープは不要です（既存の`drive`スコープの範囲で完結します）。

提供しているツール:

- `search_drive_files` / `list_drive_folder`: 参照フォルダの検索・一覧
- `read_drive_file`: Googleドキュメント・スプレッドシート・PDFの内容をテキストとして読み取る（PDFはDrive側のコピー+OCR変換の仕組みを使って抽出し、一時ファイルは自動削除。`pages`で必要なページだけを取得できる）
- `create_google_doc` / `create_google_sheet`: HTML／CSVコンテンツをアップロードし、Driveの自動変換機能でGoogleドキュメント／スプレッドシートとして「作成教材」フォルダに作成する
- `export_as_pdf`: 作成済みのドキュメント/スプレッドシートをPDFとして書き出し、元ファイルを削除する
- `save_to_question_model_folder`: 完成した教材を「12_問題モデルフォルダ」に複製し、次回以降の参照対象に加える

HTMLアップロードによる変換ベースの作成のため、Google Docs/Sheets APIの複雑なドキュメント構造操作（複数タブのスプレッドシートなど）は非対応です。用途（問題・プリント・小テストの作成）には十分な表現力を持たせつつ、実装をシンプルに保っています。

### 参照フォルダの定義と疎通確認

教材の根拠として参照するGoogleドライブのフォルダは `src/lib/drive-folders.ts` にフォルダIDで定義しています（いずれも「マイドライブ ＞ 2026【R8一宮】 ＞ R8公共」配下）。

| 用途 | フォルダ名 | 必須 |
| --- | --- | --- |
| 教科書 | `04_教科書PDF` | ○ |
| 資料集 | `06_資料集PDF` | ○ |
| 実際の共通テスト問題 | `03_共通テスト関連` | － |
| 過去に作成した問題・解答解説のモデル | `12_問題モデルフォルダ` | ○ |

フォルダを移動したり作り直した場合は、Googleドライブでフォルダを開いたときのURL（`https://drive.google.com/drive/folders/【この部分】`）を、同ファイルの `id` に貼り替えてください。フォルダ名・説明はそのままシステムプロンプトの「参照可能なGoogleドライブフォルダ」に反映されます（`src/lib/prompts.ts`）。

ログインすると、トップページの「参照フォルダ」カードに各フォルダへの疎通確認結果（接続OK／中身が空／見つかりません／権限がありません）とファイル件数・ファイル名の例が表示されます。確認はページ表示時にサーバー側（`checkReferenceFolders`, `src/lib/google-drive.ts`）で実施し、「接続を再確認」ボタンからは `/api/drive/health` を呼んで再取得します。教材を作り始める前に、必須フォルダがすべて「接続OK」になっていることを確認してください。

### 教科書・資料集PDFのページ特定（出典の正確さ）

教材の出典としてページ番号を示すため、PDFの読み取り（`read_drive_file`）はファイル名のページ範囲をもとに本文をページごとに区切って返します（`src/lib/reference-pages.ts`）。

- ファイル名から範囲を読み取ります（`27-30 伝統文化.pdf` → p.27〜30、`公共_1-1_第1部第1章（p.10-13）.pdf` → p.10〜13）。
- OCRテキストに残る各ページ下部のノンブル（その行だけが数字になっている行）を手がかりに、本文をページへ割り当てます。`(Op.144)` のような本文中の相互参照は行の一部なので誤検出しません。
- 期待するページ数だけ区切りが見つかった場合のみ「特定できた」とみなし、`--- p.29 ---` の見出しを付けて返します。特定できなかった場合は、ページ番号ではなくファイル名の範囲（例: p.27-30）で出典を示すよう本文の先頭で指示します。
- `pages`（例: `"29"`, `"29-30"`）を指定すると、そのページだけを返します。長いPDFで文字数上限に当たるのを避けられます。

資料集PDFはスキャン画像で、Drive側のOCRを通してテキスト化しています。**数値（統計・グラフ）は概ね正確に読み取れますが、人名・地名・専門用語には読み取り誤りが混ざります**（例:「サイード」→「サイカード」、「横内団地」→「積内団地」）。一方、教科書PDFはテキスト情報を持つPDFで表記も正確です。この違いを踏まえ、システムプロンプトの「出典・数値の扱い（厳守）」（`src/lib/prompts.ts`）で、数値は読み取ったテキストに現れるものだけを使うこと・用語の表記は教科書側を優先することを指示しています。

### 教材作成チャット（Anthropic API連携）

`/api/chat` がAnthropic APIの[MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)（beta）を使い、`mcp_servers` に上記のMCPサーバーのURLとログイン中ユーザーのGoogleアクセストークンを渡してリクエストします。モデルはコスト管理（Claude Proのプログラム利用クレジット月20ドル相当）を踏まえ `claude-sonnet-5`・`effort: medium` を既定にしています（`src/lib/anthropic.ts`）。システムプロンプト（参照フォルダ・出力形式・保存先・使用するMCPツールの指示）は `src/lib/prompts.ts` にまとめています。

チャット画面には出力形式に加えて「出題設定」（大問数・問題数・難易度・出題形式・解答/解説を別紙にするか・教科書の参照ページ範囲・観点別評価（観点1〜3）・グラフ/表を用いた思考力を問う問題を含めるか）を選択できます。大問数・問題数はよく使う数値のクイック選択ボタンと自由入力欄を組み合わせており、プリセット以外の数も指定できます。「出題設定」は普段は現在の設定内容（出力形式・大問数・問題数など）を1行で示す帯だけを表示し、「編集する」を押したときだけ全項目のフォームを展開する構成にして、入力欄まわりをすっきり保っています。展開後もよく使う項目（出力形式・大問数・問題数）は常に表示し、それ以外は「詳細設定を表示」でさらに開閉できます。選択内容は`materialOptions`としてリクエストに含まれ、`buildSystemPrompt`（`src/lib/prompts.ts`）がシステムプロンプトに反映します。作成される教材には、問題数などの指定の有無にかかわらず必ず解答・解説を付ける方針にしています。

チャット内のAIの返答はMarkdown（`react-markdown` + `remark-gfm`）として描画され、太字・箇条書き・見出し・表・リンクなどが読みやすく整形されます。システムプロンプト側にも、ファイル名・保存先・参照した資料などの要点をMarkdownの太字や箇条書きで示すよう指示しています。

会話内容・出題設定・よく使う指示（お気に入り）はブラウザのlocalStorageに保存され、タブを閉じたり誤って再読み込みしても復元されます。生成中はタブを閉じようとすると確認ダイアログが出るようにしています。

PCでの利用を主な想定とし、幅広い画面では教材作成チャットを主要な列、参照フォルダ・作成履歴をサイドバー列に配置する2カラムレイアウトにしています（`src/components/Workspace.tsx`）。狭い画面では1カラムに積み上がります。

#### 共通テスト型の出題パターン（A〜E）

`src/lib/prompts.ts` の `QUESTION_PATTERNS` に、実際の共通テスト問題冊子の分析にもとづく5つの出題パターンを定義しています。単元の内容に応じてAIが自動選択し、1回の出題でパターンが偏らないよう組み合わせます。

| | パターン | 適する単元 |
| --- | --- | --- |
| A | 空欄補充＋文X・Y正誤判定 | 思想・概念比較（倫理分野など） |
| B | 資料読み取り型（意見文ア〜ウの組合せ選択） | 資料集に統計データがある単元のみ |
| C | シミュレーション・条件適用型 | 制度の仕組み（政治制度・経済制度） |
| D | 正誤判定（適当でないもの）型 | 事実確認型の知識が中心の単元 |
| E | 制度比較＋会話文空欄補充型 | 制度の違いを対比させたい単元 |

パターンB〜Eの具体的な作り方は「03_共通テスト関連」の実際の問題冊子を、文体・難易度・解説の詳しさは「12_問題モデルフォルダ」の過去に作成した問題を参照させています。パターンBは資料集に統計データが実在する場合のみ使い、乏しい場合はA・Dに切り替えるよう指示しています（数値の創作を防ぐため）。あわせて、リード文は探究的な会話文から始めて200文字程度以上とする、一問一答は禁止、問題編をすべて出力してから解答・解説編をまとめて出力する、といった内容面・形式面の条件も指定しています（`QUESTION_QUALITY_RULES`）。

#### 承認ゲート（プラン → 問題案 → 保存）

Googleドキュメント／スプレッドシート／PDF出力では、一気に本生成せず3段階で進みます（`PromptPhase`, `src/lib/prompts.ts`）。

1. **プラン提示（`plan`）**: 教科書・資料集の該当箇所を実際に読んだうえで、対象範囲・各問で使うパターンとねらい・難易度の方向性・使用する統計データを箇条書きで提示します。ファイルは作成しません。指定範囲が教材の実際の分量を超えている場合は実在する範囲に補正し、その旨を報告します。
2. **問題案の提示（`draft`）**: 「このプランで進める」を押すと、承認されたプランに沿って問題編・解答解説編の全文をチャット上に提示します。会話履歴には資料本文が残らないため、作問前に該当ページを読み直すよう指示しています。
3. **保存（`confirm`）**: 「この内容で保存する」を押すと、直前の内容のままGoogleドライブにファイルを作成します。

教員が自由入力で修正を指示した場合は、直前の応答と同じ段階にとどまります（プランへの指示はプランの作り直し、問題案への指示は問題案の作り直し）。保存が完了したあとに新しい指示を出すと、またプラン提示から始まります。Googleフォーム出力はこの承認ゲートの対象外で、従来通り即座に作成されます。

保存時には、完成した教材を「作成教材」フォルダに作成したうえで、`save_to_question_model_folder`（`src/lib/drive-mcp-tools.ts`）で「12_問題モデルフォルダ」にも複製し、次回以降の参照対象に加えます。Drive APIでは1つのファイルが複数フォルダに属せないため複製（コピー）で、原本を後から編集してもモデル側には反映されません。

#### 保存確認フローの実装

これらの出力形式では、教材の内容はまず「下書き」としてチャット上に全文提示され、Googleドライブへのファイル作成はまだ行われません（`buildSystemPrompt`の`draft`フェーズ、`src/lib/prompts.ts`）。内容を確認し、問題なければ回答の下に表示される「この内容で保存する」ボタンを押すと、直前の内容をそのまま使ってGoogleドライブに実際にファイルを作成します（`confirm`フェーズ、同ファイル）。フロントエンドは確認操作を通常のチャット送信として扱い、リクエストに`confirmSave: true`と、下書き生成時の出力形式（`outputFormatUsed`）を付加します（`src/components/ChatPanel.tsx`の`handleConfirmSave`）。気に入らない下書きはそのまま指示を続けて修正でき、無関係なファイルが「作成教材」フォルダに溜まるのを防げます。Googleフォーム出力はこの確認フローの対象外で、従来通り即座に作成されます。

### 作成履歴パネル

`/api/materials` がGoogle Drive API（v3）を直接呼び出し、マイドライブ直下の「作成教材」フォルダ内のファイルを作成日時順に取得します（`src/lib/google-drive.ts`）。チャット画面下の作成履歴パネル（`src/components/MaterialsPanel.tsx`）に表示され、教材作成が完了するたびに自動更新されます。

Googleフォーム（自動採点）のファイルには「回答を分析」ボタンが表示され、Forms APIから回答結果を取得して、設問ごとの正答率を低い順に一覧表示します（`analyzeFormResponses`、`src/lib/google-forms.ts`、`/api/materials/analyze`）。正答率は色分け（赤:50%未満・黄:80%未満・緑:80%以上）して表示され、復習が必要な設問がひと目でわかります。データベースは使わず、都度Forms APIから最新の構成・回答を取得して集計する方式です。この機能には`https://www.googleapis.com/auth/forms.responses.readonly`スコープが必要です（`src/lib/google-oauth.ts`）。既にログイン済みの場合は、一度ログアウトして再度Googleでログインし、新しい権限を許可し直してください。

### Googleフォーム出力（自動採点・解説つき）

出力形式で「Googleフォーム（自動採点）」を選ぶと、生徒がGoogleフォームで解答し、送信直後に得点と各設問の解説（正解・不正解を問わず）が表示されるクイズを自動作成します。

Google Drive MCPサーバーはフォームを作成できないため、この出力形式ではMCPツールでのファイル作成を行わず、代わりにモデルが応答の末尾に設問データ（設問文・選択肢・正解・解説・配点）をJSONコードブロックとして出力するよう指示します（`buildSystemPrompt`の`google_form`分岐、`src/lib/prompts.ts`）。`/api/chat`（`src/app/api/chat/route.ts`）がこのJSONだけを抽出してチャット画面には表示せず、Google Forms API（`src/lib/google-forms.ts`）でクイズ形式のフォームを作成し、「作成教材」フォルダに移動します（`moveFileToMaterialsFolder`, `src/lib/google-drive.ts`）。

- この機能には`https://www.googleapis.com/auth/forms.body`スコープが必要です（`src/lib/google-oauth.ts`）。既にログイン済みの場合は、一度ログアウトして再度Googleでログインし、新しい権限を許可し直してください。
- Google Forms APIには「採点結果を送信直後に表示する」設定をプログラムから指定する手段が公開されていないため、初回作成時はフォームの「設定」→「回答」でこの設定になっているか一度確認することを推奨します（チャットの完了メッセージでも案内します）。
- 自動採点の都合上、この出力形式では選択式・穴埋め・一問一答形式の短答式のみが出題対象です（長文の論述式などは対象外）。

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

1. **Anthropic APIキーを用意する**: [console.anthropic.com](https://console.anthropic.com/)でAPIキーを発行する（Claude Proの契約がある場合、月20ドル相当のプログラム利用クレジットが適用される場合があります。詳細はAnthropicの案内を確認してください）。
2. **Google CloudのOAuthクライアントを準備する**（上記「Google OAuthクライアントの準備」参照）。この時点ではリダイレクトURIは仮のものでよく、後述の手順4で本番URLを追加します。
3. GitHubリポジトリをVercelにインポートする（Frameworkは自動検出されるはず）
4. Vercelプロジェクトの Settings → Environment Variables に `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET` の4つを設定する（`GOOGLE_REDIRECT_URI`と`GOOGLE_DRIVE_MCP_SERVER_URL`は未設定でよい）
5. デプロイを実行し、払い出された本番URLを開く
6. アプリ画面の「セットアップ状況」カードに表示されるリダイレクトURIをコピーし、Google Cloud ConsoleのOAuthクライアントの「承認済みのリダイレクトURI」に追加する（環境変数の更新・再デプロイは不要）
7. 本番URLにアクセスしてGoogleでログインし、簡単な指示（例:「政治参加と選挙の単元で選択式の小テストを3問作成してください」）を送って、下書きの提示→「この内容で保存する」→Googleドライブの「作成教材」フォルダにファイルが作成されることを確認する
8. Googleフォーム出力を使う場合は、一度ログアウトして再度Googleでログインし、`forms.body`・`forms.responses.readonly`スコープの権限を許可し直す

### 無料（Hobby）プランの制約

- Serverless Functionsの実行時間には上限があるため、`/api/chat` には `maxDuration = 60`（秒）を設定しています。教材生成に時間がかかりGoogleドライブ操作を伴う場合、60秒を超えるとタイムアウトする可能性があります。頻繁にタイムアウトする場合はVercelのProプランへの変更や、生成指示を分割する運用を検討してください。
- Anthropic APIの呼び出しはClaude Proのプログラム利用クレジット（月20ドル相当）の範囲内を想定しており、追加課金は有効化していません。想定より頻度・分量が多い場合は`src/lib/anthropic.ts`の`CHAT_EFFORT`（既定: `medium`）を`low`に下げるなどしてコストを調整してください。

## Claude Codeスキルとしての利用（Anthropic APIの費用をかけない方法）

このWebアプリはAnthropic APIを従量課金で呼び出すため、教材を作成するたびに費用が発生します。費用をかけずに同じ設計で教材を作りたい場合は、リポジトリに同梱している**Claude Codeのスキル**（`.claude/skills/kyozai/SKILL.md`）を使います。

[claude.ai/code](https://claude.ai/code) でこのリポジトリのセッションを開き、`/kyozai` に続けて単元と問題数を指示すると、Claude CodeがGoogle Driveコネクタ経由で教科書PDF・資料集PDFを読み、承認ゲート（プラン→問題案→保存）を経てGoogleドキュメントを「作成教材」フォルダに作成します。Anthropic APIの従量課金は発生せず、Claude の契約の範囲内で利用できます。

Webアプリ版と比べて実現できることの違いは次のとおりです。

| 機能 | Webアプリ版 | Claude Codeスキル版 |
| --- | :---: | :---: |
| 教科書・資料集PDFの参照、出典ページの特定 | ○ | ○ |
| 出題パターンA〜Eの自動選択、承認ゲート | ○ | ○ |
| Googleドキュメントの作成、問題モデルフォルダへの登録 | ○ | ○ |
| Googleフォーム（自動採点）の作成、回答の正答率分析 | ○ | × |
| 専用のWeb画面 | ○ | ×（チャット） |
| Anthropic APIの従量課金 | あり | なし |

スキルとWebアプリは同じ設計（`src/lib/prompts.ts`・`src/lib/drive-folders.ts`・`src/lib/reference-pages.ts`）にもとづいているため、出題パターンや出典の扱いを変更するときは両方を更新してください。
