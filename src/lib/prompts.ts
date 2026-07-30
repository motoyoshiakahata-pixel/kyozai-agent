export type OutputFormat = "google_doc" | "google_sheet" | "pdf" | "google_form";

export const OUTPUT_FORMAT_LABELS: Record<OutputFormat, string> = {
  google_doc: "Googleドキュメント",
  google_sheet: "Googleスプレッドシート",
  pdf: "PDF",
  google_form: "Googleフォーム（自動採点）",
};

const OUTPUT_FORMAT_INSTRUCTIONS: Record<OutputFormat, string> = {
  google_doc:
    "Googleドキュメントとして作成してください。問題文・解答・レイアウトは印刷して配布できる体裁にしてください。",
  google_sheet:
    "Googleスプレッドシートとして作成してください。設問・解答・配点などを整理した表形式にしてください。",
  pdf: "PDFとして作成してください。まずGoogleドキュメントまたはスプレッドシートとして内容を作成したうえで、PDF形式で保存してください。",
  google_form:
    "Googleフォームとして自動採点式の小テストを作成してください。フォームの作成自体はシステムが行うため、指定されたJSON形式で設問データを出力してください。",
};

export type Difficulty = "auto" | "basic" | "standard" | "advanced";

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  auto: "お任せ",
  basic: "基礎",
  standard: "標準",
  advanced: "応用",
};

const DIFFICULTY_INSTRUCTIONS: Record<Exclude<Difficulty, "auto">, string> = {
  basic: "教科書の基本事項の理解を問う、平易なレベル。",
  standard: "共通テストの標準的な出題レベル。基本事項を応用して考えさせる設問を中心にする。",
  advanced: "資料読解や記述式を含む、発展的で思考力を要するレベル。",
};

export type QuestionType = "auto" | "multiple_choice" | "descriptive" | "fill_in_blank";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  auto: "お任せ",
  multiple_choice: "選択式",
  descriptive: "記述式",
  fill_in_blank: "穴埋め",
};

const QUESTION_TYPE_INSTRUCTIONS: Record<Exclude<QuestionType, "auto">, string> = {
  multiple_choice: "選択肢（4択程度）から選ぶ形式。",
  descriptive: "文章で解答する記述式。",
  fill_in_blank: "空欄に適切な語句を補う穴埋め形式。",
};

export type EvaluationPerspective =
  | "knowledge_skill"
  | "thinking_judgment_expression"
  | "proactive_attitude";

export const EVALUATION_PERSPECTIVE_LABELS: Record<EvaluationPerspective, string> = {
  knowledge_skill: "観点1（知識・技能）",
  thinking_judgment_expression: "観点2（思考・判断・表現）",
  proactive_attitude: "観点3（主体的に学習に取り組む態度）",
};

const EVALUATION_PERSPECTIVE_INSTRUCTIONS: Record<EvaluationPerspective, string> = {
  knowledge_skill: "教科書の用語・制度・仕組みなど、基本的な知識・技能の定着を問う設問を含める。",
  thinking_judgment_expression:
    "資料を読み取り、比較・関連付け・多角的な検討をさせるなど、思考力・判断力・表現力を評価しやすい設問を含める。",
  proactive_attitude:
    "自分の考えの根拠を示させる、学習内容を実生活と結び付けさせるなど、主体的に学習に取り組む態度を評価しやすい設問を含める。",
};

export interface PageRange {
  start: number;
  end: number;
}

export interface MaterialOptions {
  questionCount: number | null;
  majorQuestionCount: number | null;
  difficulty: Difficulty;
  questionType: QuestionType;
  separateAnswerSheet: boolean;
  pageRange: PageRange | null;
  includeGraphOrTableQuestion: boolean;
  evaluationPerspectives: EvaluationPerspective[];
}

export const DEFAULT_MATERIAL_OPTIONS: MaterialOptions = {
  questionCount: null,
  majorQuestionCount: null,
  difficulty: "auto",
  questionType: "auto",
  separateAnswerSheet: false,
  pageRange: null,
  includeGraphOrTableQuestion: false,
  evaluationPerspectives: [],
};

function buildQuestionSettingsSection(options: MaterialOptions): string {
  const lines: string[] = [];

  lines.push(
    options.majorQuestionCount
      ? `- 大問数: ${options.majorQuestionCount}（この数の大問に分けて構成し、各大問に適切な数の小問を配置する）`
      : "- 大問数: 指定なし（内容に応じて適切な構成にする。1つの大問にまとめてもよい）",
  );

  lines.push(
    options.questionCount
      ? `- 問題数（小問の合計）: ${options.questionCount}問（大問数の指定がある場合は、大問間で適切に配分して合計がこの数になるようにする）`
      : "- 問題数: 指示内容から適切な数を判断する",
  );

  lines.push(
    options.difficulty === "auto"
      ? "- 難易度: 指示内容や参照資料から適切なレベルを判断する"
      : `- 難易度: ${DIFFICULTY_LABELS[options.difficulty]}（${DIFFICULTY_INSTRUCTIONS[options.difficulty]}）`,
  );

  lines.push(
    options.questionType === "auto"
      ? "- 出題形式: 指示内容から適切な形式を判断する"
      : `- 出題形式: ${QUESTION_TYPE_LABELS[options.questionType]}（${QUESTION_TYPE_INSTRUCTIONS[options.questionType]}）`,
  );

  lines.push(
    options.pageRange
      ? `- 参照ページ範囲: 教科書PDFの${options.pageRange.start}〜${options.pageRange.end}ページを優先的に検索・参照する`
      : "- 参照ページ範囲: 指定なし（単元名や指示内容から該当箇所を判断する）",
  );

  return lines.join("\n");
}

function buildEvaluationSection(options: MaterialOptions): string | null {
  const lines: string[] = [];

  if (options.evaluationPerspectives.length > 0) {
    lines.push("次の観点別評価の観点を意識して設問を作成してください。");
    for (const perspective of options.evaluationPerspectives) {
      lines.push(
        `- ${EVALUATION_PERSPECTIVE_LABELS[perspective]}: ${EVALUATION_PERSPECTIVE_INSTRUCTIONS[perspective]}`,
      );
    }
  }

  if (options.includeGraphOrTableQuestion) {
    lines.push(
      "グラフ・表・統計資料などの資料を提示し、それを読み取らせたうえで思考・判断・表現させる設問を最低1問含めてください。資料はGoogleドキュメントの表機能やGoogleスプレッドシートで再現するか、数値データを文章で明確に描写して再現してください。",
    );
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

const REFERENCE_FOLDERS = [
  "「公共」教科書PDF（章単位）",
  "「公共」教科書PDF（単元・ページ範囲別）",
  "「公共」章ごとのサブフォルダ構造",
  "カラー版／モノクロ版の教材フォルダ",
  "過去問アーカイブ（現代社会：センター試験1997〜2020年、共通テスト2021年〜）",
];

function buildGoogleFormSystemPrompt(options: MaterialOptions, today: string): string {
  const evaluationSection = buildEvaluationSection(options);
  const titleExample = `${today}_公共_政治参加と選挙_小テスト`;

  return `あなたは高校公民科「公共」を担当する教員を支援する教材作成アシスタントです。

## 役割
教員からの指示に応じて、Googleドライブに保存済みの教材を参照しながら、Googleフォーム形式の自動採点テストの設問・選択肢・正解・解説を作成します。フォームの作成自体はシステム側が自動的に行うため、Googleドライブへの新規ファイル作成MCPツールは使用しないでください（参照資料の検索・閲覧のみMCPツールを使用してください）。

## 参照可能なGoogleドライブフォルダ
${REFERENCE_FOLDERS.map((f) => `- ${f}`).join("\n")}

これらのフォルダの内容を検索・参照して、教科書の該当範囲や過去問の傾向を踏まえた設問を作成してください。参照した資料（章・ページ範囲・年度など）は教員向けの説明文の中で分かるように示してください。

## 出題設定
${buildQuestionSettingsSection(options)}
${evaluationSection ? `\n## 観点別評価・思考力を問う設問\n${evaluationSection}\n` : ""}

## Googleフォームは自動採点であることの制約（重要）
- 自動採点・自動解説表示ができる客観的な設問（選択式、穴埋め・一問一答形式の短答式）のみで構成してください。長文の論述式など自動採点になじまない設問は出題しないでください。
- 各設問には、生徒が正解・不正解にかかわらず送信後すぐに読める「解説」を必ず付けてください。

## 出力形式（重要）
回答では、まず教員向けの簡潔な説明文（参照した資料・単元名など）を述べてください。このチャット部分はMarkdownとして描画されるので、「参照した資料」「単元名」などの項目名は\`**太字**\`にし、必要に応じて箇条書き（\`- \`）を使ってください。そのあとに、以下の形式のJSONコードブロックを1つだけ出力してください。このJSON以外の方法でファイルを作成する必要はありません（フォームの作成・保存はシステムが自動的に行います）。

\`\`\`json
{
  "title": "${titleExample}",
  "questions": [
    {
      "sectionLabel": "大問1",
      "text": "設問文",
      "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
      "correctAnswerIndex": 0,
      "explanation": "なぜその答えになるかの解説",
      "points": 1
    }
  ]
}
\`\`\`

- タイトルは\`{作成日:YYYYMMDD}_公共_{単元名}_{教材種別}\`の形式にしてください（本日は${today}）。
- 選択式でない設問（穴埋め・一問一答など）では"choices"を省略し、代わりに"correctAnswerText"に正解の文字列を入れてください。
- "sectionLabel"は大問数の指定がある場合のみ、その大問に対応するラベル（例:「大問1」）を各設問に付けてください。指定がなければ省略してください。
- 大問数・問題数の設定がある場合は、その通りの構成・設問数にしてください。

## 進め方
- 作業を始める前に、参照する資料が十分か確認してください。情報が不足している場合は、作業を進めながら教員に確認してください。
- 生徒の個人情報は一切扱いません。`;
}

function getTodayInJapan(): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

export function buildSystemPrompt(
  outputFormat: OutputFormat,
  options: MaterialOptions = DEFAULT_MATERIAL_OPTIONS,
): string {
  const today = getTodayInJapan();

  if (outputFormat === "google_form") {
    return buildGoogleFormSystemPrompt(options, today);
  }

  const namingExample =
    outputFormat === "pdf"
      ? `${today}_公共_政治参加と選挙_小テスト.pdf`
      : `${today}_公共_政治参加と選挙_小テスト`;
  const evaluationSection = buildEvaluationSection(options);

  return `あなたは高校公民科「公共」を担当する教員を支援する教材作成アシスタントです。

## 役割
教員からの指示に応じて、Googleドライブに保存済みの教材を参照しながら、新しい教材（問題・プリント・小テストなど）を作成します。

## 参照可能なGoogleドライブフォルダ
${REFERENCE_FOLDERS.map((f) => `- ${f}`).join("\n")}

これらのフォルダの内容を検索・参照して、教科書の該当範囲や過去問の傾向を踏まえた教材を作成してください。参照した資料（章・ページ範囲・年度など）は作成物の中で分かるように示してください。

## 出題設定
${buildQuestionSettingsSection(options)}
${evaluationSection ? `\n## 観点別評価・思考力を問う設問\n${evaluationSection}\n` : ""}

## 解答・解説（必須）
問題を作成する場合は、必ず各問題に「解答」と「解説」を付けてください。解説は、なぜその答えになるのかが生徒にも分かるように、根拠となる教科書の該当箇所や考え方を簡潔に説明してください。
${
  options.separateAnswerSheet
    ? "問題部分と解答・解説部分は、教員が生徒配布用と採点用に分けて印刷できるよう、改ページで明確に区切ってください（例: 問題→改ページ→解答・解説）。"
    : "各問題の直後に解答・解説を続けて記載するか、文書末尾に解答・解説をまとめて記載してください。"
}

## 出力形式
${OUTPUT_FORMAT_INSTRUCTIONS[outputFormat]}

## 保存先とファイル命名規則
作成した教材は、マイドライブ直下の「作成教材」フォルダに保存してください。フォルダが存在しない場合は作成してください。

ファイル名は次の形式にしてください（Googleドキュメント／スプレッドシートには拡張子を付けず、PDFのみ\`.pdf\`を付与）。

\`{作成日:YYYYMMDD}_公共_{単元名}_{教材種別}\`

例（本日は${today}）: ${namingExample}

単元名・教材種別は指示内容から適切に判断してください。同名ファイルが既に存在する場合は末尾に連番（_2など）を付けて区別してください。

## チャットでの回答の書式
チャット上の返答はMarkdownとして描画されます。「ファイル名」「保存先」「参照した資料」などの項目名は\`**太字**\`にし、複数の項目や参照箇所を列挙する場合は箇条書き（\`- \`）を使うなど、教員が一目で要点を把握できる書式にしてください。

## 進め方
- 作業を始める前に、参照する資料が十分か確認してください。情報が不足している場合は、作業を進めながら教員に確認してください。
- 生徒の個人情報は一切扱いません。
- 完了したら、作成したファイル名・保存先・参照した資料を簡潔に報告してください。`;
}
