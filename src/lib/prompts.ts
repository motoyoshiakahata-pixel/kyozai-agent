export type OutputFormat = "google_doc" | "google_sheet" | "pdf";

export const OUTPUT_FORMAT_LABELS: Record<OutputFormat, string> = {
  google_doc: "Googleドキュメント",
  google_sheet: "Googleスプレッドシート",
  pdf: "PDF",
};

const OUTPUT_FORMAT_INSTRUCTIONS: Record<OutputFormat, string> = {
  google_doc:
    "Googleドキュメントとして作成してください。問題文・解答・レイアウトは印刷して配布できる体裁にしてください。",
  google_sheet:
    "Googleスプレッドシートとして作成してください。設問・解答・配点などを整理した表形式にしてください。",
  pdf: "PDFとして作成してください。まずGoogleドキュメントまたはスプレッドシートとして内容を作成したうえで、PDF形式で保存してください。",
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

export interface MaterialOptions {
  questionCount: number | null;
  difficulty: Difficulty;
  questionType: QuestionType;
  separateAnswerSheet: boolean;
}

export const DEFAULT_MATERIAL_OPTIONS: MaterialOptions = {
  questionCount: null,
  difficulty: "auto",
  questionType: "auto",
  separateAnswerSheet: false,
};

function buildQuestionSettingsSection(options: MaterialOptions): string {
  const lines: string[] = [];

  lines.push(
    options.questionCount
      ? `- 問題数: ${options.questionCount}問（指定がない限りこの数で作成する）`
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

  return lines.join("\n");
}

const REFERENCE_FOLDERS = [
  "「公共」教科書PDF（章単位）",
  "「公共」教科書PDF（単元・ページ範囲別）",
  "「公共」章ごとのサブフォルダ構造",
  "カラー版／モノクロ版の教材フォルダ",
  "過去問アーカイブ（現代社会：センター試験1997〜2020年、共通テスト2021年〜）",
];

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
  const namingExample =
    outputFormat === "pdf"
      ? `${today}_公共_政治参加と選挙_小テスト.pdf`
      : `${today}_公共_政治参加と選挙_小テスト`;

  return `あなたは高校公民科「公共」を担当する教員を支援する教材作成アシスタントです。

## 役割
教員からの指示に応じて、Googleドライブに保存済みの教材を参照しながら、新しい教材（問題・プリント・小テストなど）を作成します。

## 参照可能なGoogleドライブフォルダ
${REFERENCE_FOLDERS.map((f) => `- ${f}`).join("\n")}

これらのフォルダの内容を検索・参照して、教科書の該当範囲や過去問の傾向を踏まえた教材を作成してください。参照した資料（章・ページ範囲・年度など）は作成物の中で分かるように示してください。

## 出題設定
${buildQuestionSettingsSection(options)}

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

## 進め方
- 作業を始める前に、参照する資料が十分か確認してください。情報が不足している場合は、作業を進めながら教員に確認してください。
- 生徒の個人情報は一切扱いません。
- 完了したら、作成したファイル名・保存先・参照した資料を簡潔に報告してください。`;
}
