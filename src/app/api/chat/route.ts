import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getValidAccessToken } from "@/lib/session";
import {
  getAnthropicClient,
  CHAT_MODEL,
  CHAT_EFFORT,
  CHAT_MAX_TOKENS,
  MCP_SERVER_NAME,
} from "@/lib/anthropic";
import {
  buildSystemPrompt,
  DEFAULT_MATERIAL_OPTIONS,
  type Difficulty,
  type EvaluationPerspective,
  type MaterialOptions,
  type OutputFormat,
  type PageRange,
  type PromptPhase,
  type QuestionType,
} from "@/lib/prompts";
import { describeMcpToolUse, type ChatStreamEvent } from "@/lib/chat-events";
import { createQuizForm, extractQuizFormJson, parseQuizFormData } from "@/lib/google-forms";
import { moveFileToMaterialsFolder } from "@/lib/google-drive";
import { getMcpServerUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";
// Vercel Hobby(無料)プランで設定可能な上限。教材生成が長時間化する場合は
// Proプランへの変更や生成対象の分割を検討する。
export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_CONTINUATIONS = 3;

const PROMPT_PHASES: PromptPhase[] = ["plan", "draft", "confirm"];

const DIFFICULTIES: Difficulty[] = ["auto", "basic", "standard", "advanced"];
const QUESTION_TYPES: QuestionType[] = [
  "auto",
  "multiple_choice",
  "descriptive",
  "fill_in_blank",
];
const EVALUATION_PERSPECTIVES: EvaluationPerspective[] = [
  "knowledge_skill",
  "thinking_judgment_expression",
  "proactive_attitude",
];

function parsePageRange(raw: unknown): PageRange | null {
  const value = raw as { start?: unknown; end?: unknown } | undefined;
  const start =
    typeof value?.start === "number" && Number.isInteger(value.start) && value.start > 0
      ? value.start
      : null;
  const end =
    typeof value?.end === "number" && Number.isInteger(value.end) && value.end > 0 ? value.end : null;

  return start !== null && end !== null && end >= start ? { start, end } : null;
}

function parseMaterialOptions(body: unknown): MaterialOptions {
  const raw = (body as { materialOptions?: Record<string, unknown> })?.materialOptions ?? {};

  const questionCount =
    typeof raw.questionCount === "number" && Number.isInteger(raw.questionCount) && raw.questionCount > 0
      ? raw.questionCount
      : null;

  const majorQuestionCount =
    typeof raw.majorQuestionCount === "number" &&
    Number.isInteger(raw.majorQuestionCount) &&
    raw.majorQuestionCount > 0
      ? raw.majorQuestionCount
      : null;

  const difficulty = DIFFICULTIES.includes(raw.difficulty as Difficulty)
    ? (raw.difficulty as Difficulty)
    : DEFAULT_MATERIAL_OPTIONS.difficulty;

  const questionType = QUESTION_TYPES.includes(raw.questionType as QuestionType)
    ? (raw.questionType as QuestionType)
    : DEFAULT_MATERIAL_OPTIONS.questionType;

  const separateAnswerSheet = raw.separateAnswerSheet === true;
  const pageRange = parsePageRange(raw.pageRange);
  const includeGraphOrTableQuestion = raw.includeGraphOrTableQuestion === true;

  const evaluationPerspectives = Array.isArray(raw.evaluationPerspectives)
    ? raw.evaluationPerspectives.filter((p): p is EvaluationPerspective =>
        EVALUATION_PERSPECTIVES.includes(p as EvaluationPerspective),
      )
    : [];

  return {
    questionCount,
    majorQuestionCount,
    difficulty,
    questionType,
    separateAnswerSheet,
    pageRange,
    includeGraphOrTableQuestion,
    evaluationPerspectives,
  };
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) {
    return "現在Anthropic APIへのアクセスが集中しています。しばらくしてから再度お試しください。";
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return "Anthropic APIの認証に失敗しました。管理者に環境変数の設定を確認してもらってください。";
  }
  if (error instanceof Anthropic.BadRequestError) {
    return "リクエストの内容に問題があります。指示の内容を変えて再度お試しください。";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Anthropic APIまたはGoogle Drive MCPサーバーへの接続に失敗しました。しばらくしてから再度お試しください。";
  }
  if (error instanceof Anthropic.APIError) {
    return `Anthropic APIでエラーが発生しました（${error.status ?? "unknown"}）。しばらくしてから再度お試しください。`;
  }
  return "エラーが発生しました。しばらくしてから再度お試しください。";
}

export async function POST(request: NextRequest) {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return new Response("ログインが必要です。再度Googleでログインしてください。", {
      status: 401,
    });
  }

  // GOOGLE_DRIVE_MCP_SERVER_URL未設定時は、このアプリ自身に内蔵しているMCPサーバー
  // （src/app/api/mcp/route.ts）を、アクセス中のURLから組み立てて使う。
  const mcpServerUrl = await getMcpServerUrl();
  if (!mcpServerUrl) {
    return new Response(
      "サーバー設定エラー: MCPサーバーのURLを判別できませんでした。ローカル開発など、インターネットから到達できるhttpsのURLがない環境では、GOOGLE_DRIVE_MCP_SERVER_URL を明示的に設定してください。",
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const messages: ChatMessage[] | undefined = body?.messages;
  const outputFormat: OutputFormat | undefined = body?.outputFormat;
  const confirmSave: boolean = body?.confirmSave === true;

  if (!Array.isArray(messages) || messages.length === 0 || !outputFormat) {
    return new Response("リクエストの形式が不正です。", { status: 400 });
  }

  const materialOptions = parseMaterialOptions(body);
  // 承認ゲート: plan（作成プラン提示）→ draft（問題案提示）→ confirm（保存）。
  // confirmSaveは保存ボタン由来の指定で、phaseより優先する。
  const phase: PromptPhase = confirmSave
    ? "confirm"
    : PROMPT_PHASES.includes(body?.phase)
      ? body.phase
      : "plan";

  const client = getAnthropicClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (event: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      let anthropicMessages: Anthropic.Beta.BetaMessageParam[] = messages.map(
        (m) => ({ role: m.role, content: m.content }),
      );

      // Googleフォーム出力では、アシスタントが出力するJSONコードブロックは
      // チャット画面に表示せず、フォーム作成にのみ使用する。
      let rawAssistantText = "";
      let jsonFenceStarted = false;
      let hadRefusal = false;

      const handleTextDelta = (delta: string) => {
        rawAssistantText += delta;

        if (outputFormat !== "google_form") {
          sendEvent({ type: "delta", text: delta });
          return;
        }
        if (jsonFenceStarted) return;

        // モデルが ```json ではなく ``` json / ```JSON などの表記を
        // 使う場合もあるため、コードフェンス自体（```）で判定する。
        const fenceIndex = rawAssistantText.indexOf("```");
        if (fenceIndex === -1) {
          sendEvent({ type: "delta", text: delta });
          return;
        }

        jsonFenceStarted = true;
        const priorLength = rawAssistantText.length - delta.length;
        if (fenceIndex > priorLength) {
          sendEvent({ type: "delta", text: rawAssistantText.slice(priorLength, fenceIndex) });
        }
      };

      try {
        for (let i = 0; i < MAX_CONTINUATIONS; i++) {
          const mcpStream = client.beta.messages.stream({
            model: CHAT_MODEL,
            max_tokens: CHAT_MAX_TOKENS,
            system: buildSystemPrompt(outputFormat, materialOptions, phase),
            messages: anthropicMessages,
            output_config: { effort: CHAT_EFFORT },
            mcp_servers: [
              {
                type: "url",
                name: MCP_SERVER_NAME,
                url: mcpServerUrl,
                authorization_token: accessToken,
              },
            ],
            tools: [{ type: "mcp_toolset", mcp_server_name: MCP_SERVER_NAME }],
            betas: ["mcp-client-2025-11-20"],
          });

          mcpStream.on("text", handleTextDelta);

          mcpStream.on("contentBlock", (block) => {
            if (block.type === "mcp_tool_use") {
              sendEvent({ type: "status", text: describeMcpToolUse(block.name) });
            } else if (block.type === "mcp_tool_result" && block.is_error) {
              sendEvent({
                type: "status",
                text: "Googleドライブの操作でエラーが発生しました。別の方法を試みます…",
              });
            }
          });

          const finalMessage = await mcpStream.finalMessage();

          if (finalMessage.stop_reason === "pause_turn") {
            anthropicMessages = [
              ...anthropicMessages,
              { role: "assistant", content: finalMessage.content },
            ];
            continue;
          }

          if (finalMessage.stop_reason === "refusal") {
            hadRefusal = true;
            sendEvent({
              type: "error",
              text: "このリクエストは処理できませんでした。内容を変えて再度お試しください。",
            });
          }

          break;
        }

        if (outputFormat === "google_form" && !hadRefusal) {
          const formJson = extractQuizFormJson(rawAssistantText);
          if (!formJson) {
            sendEvent({
              type: "error",
              text: "Googleフォーム用の設問データを読み取れませんでした。もう一度お試しください。",
            });
          } else {
            try {
              sendEvent({ type: "status", text: "Googleフォームを作成しています…" });
              const quizFormData = parseQuizFormData(formJson);
              const createdForm = await createQuizForm(accessToken, quizFormData);
              sendEvent({ type: "status", text: "フォームを「作成教材」フォルダに移動しています…" });
              await moveFileToMaterialsFolder(accessToken, createdForm.formId);
              sendEvent({
                type: "delta",
                text:
                  `\n\nGoogleフォームを作成しました。\n回答用リンク: ${createdForm.responderUri}\n編集用リンク: ${createdForm.editUri}\n\n` +
                  "※ 初回のみ、フォームの「設定」→「回答」で採点結果の表示が「送信直後」になっているかご確認ください。",
              });
            } catch (formError) {
              console.error("Googleフォームの作成に失敗しました", formError);
              const isPermissionError =
                formError instanceof Error && /\b(401|403)\b/.test(formError.message);
              sendEvent({
                type: "error",
                text: isPermissionError
                  ? "Googleフォームの作成権限がありません。一度ログアウトしてから再度Googleでログインし、フォームへのアクセスを許可してください。"
                  : "Googleフォームの作成に失敗しました。しばらくしてから再度お試しください。",
              });
            }
          }
        }
      } catch (error) {
        console.error("Anthropic API呼び出しに失敗しました", error);
        sendEvent({ type: "error", text: describeError(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
