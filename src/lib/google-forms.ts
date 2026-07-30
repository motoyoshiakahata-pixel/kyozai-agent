import "server-only";

const FORMS_API_BASE = "https://forms.googleapis.com/v1/forms";

export interface QuizQuestion {
  sectionLabel?: string;
  text: string;
  choices?: string[];
  correctAnswerIndex?: number;
  correctAnswerText?: string;
  explanation: string;
  points?: number;
}

export interface QuizFormData {
  title: string;
  questions: QuizQuestion[];
}

export interface CreatedQuizForm {
  formId: string;
  responderUri: string;
  editUri: string;
}

async function formsFetch(
  accessToken: string,
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${FORMS_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Forms APIの呼び出しに失敗しました: ${res.status} ${body}`);
  }

  return res.json();
}

function questionToItemRequest(question: QuizQuestion, index: number) {
  const isChoiceQuestion = Array.isArray(question.choices) && question.choices.length > 0;
  const correctAnswerValue = isChoiceQuestion
    ? question.choices![question.correctAnswerIndex ?? 0]
    : (question.correctAnswerText ?? "");

  const title = question.sectionLabel ? `[${question.sectionLabel}] ${question.text}` : question.text;

  return {
    createItem: {
      item: {
        title,
        questionItem: {
          question: {
            required: true,
            grading: {
              pointValue: question.points ?? 1,
              correctAnswers: { answers: [{ value: correctAnswerValue }] },
              whenRight: { text: question.explanation },
              whenWrong: { text: question.explanation },
            },
            ...(isChoiceQuestion
              ? {
                  choiceQuestion: {
                    type: "RADIO",
                    options: question.choices!.map((choice) => ({ value: choice })),
                  },
                }
              : { textQuestion: { paragraph: false } }),
          },
        },
      },
      location: { index },
    },
  };
}

const JSON_FENCE_PATTERN = /```json\s*([\s\S]*?)```/;

// アシスタントの回答テキストから、フォーム作成用のJSONコードブロックを取り出す。
export function extractQuizFormJson(text: string): string | null {
  const match = text.match(JSON_FENCE_PATTERN);
  return match ? match[1] : null;
}

export function parseQuizFormData(jsonText: string): QuizFormData {
  const parsed: unknown = JSON.parse(jsonText);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("フォームデータの形式が不正です。");
  }
  const record = parsed as Record<string, unknown>;

  const title = typeof record.title === "string" && record.title.trim() ? record.title.trim() : "無題のフォーム";
  const questionsRaw = Array.isArray(record.questions) ? record.questions : [];
  if (questionsRaw.length === 0) {
    throw new Error("設問データが見つかりませんでした。");
  }

  const questions: QuizQuestion[] = questionsRaw.map((raw: unknown, index: number) => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`${index + 1}問目のデータ形式が不正です。`);
    }
    const q = raw as Record<string, unknown>;
    const text = typeof q.text === "string" ? q.text : "";
    if (!text) throw new Error(`${index + 1}問目の設問文がありません。`);

    return {
      sectionLabel: typeof q.sectionLabel === "string" ? q.sectionLabel : undefined,
      text,
      choices: Array.isArray(q.choices)
        ? q.choices.filter((c): c is string => typeof c === "string")
        : undefined,
      correctAnswerIndex: typeof q.correctAnswerIndex === "number" ? q.correctAnswerIndex : undefined,
      correctAnswerText: typeof q.correctAnswerText === "string" ? q.correctAnswerText : undefined,
      explanation: typeof q.explanation === "string" ? q.explanation : "",
      points: typeof q.points === "number" ? q.points : undefined,
    };
  });

  return { title, questions };
}

// クイズ形式(自動採点・解説表示あり)のGoogleフォームを新規作成する。
export async function createQuizForm(
  accessToken: string,
  data: QuizFormData,
): Promise<CreatedQuizForm> {
  const created = await formsFetch(accessToken, "", {
    method: "POST",
    body: JSON.stringify({ info: { title: data.title } }),
  });

  const formId = created.formId as string;

  const requests = [
    {
      updateSettings: {
        settings: { quizSettings: { isQuiz: true } },
        updateMask: "quizSettings.isQuiz",
      },
    },
    ...data.questions.map((question, index) => questionToItemRequest(question, index)),
  ];

  await formsFetch(accessToken, `/${formId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });

  return {
    formId,
    responderUri: `https://docs.google.com/forms/d/${formId}/viewform`,
    editUri: `https://docs.google.com/forms/d/${formId}/edit`,
  };
}
