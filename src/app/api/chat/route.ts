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
import { buildSystemPrompt, type OutputFormat } from "@/lib/prompts";
import { describeMcpToolUse, type ChatStreamEvent } from "@/lib/chat-events";

export const dynamic = "force-dynamic";
// Vercel Hobby(無料)プランで設定可能な上限。教材生成が長時間化する場合は
// Proプランへの変更や生成対象の分割を検討する。
export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_CONTINUATIONS = 3;

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

  const mcpServerUrl = process.env.GOOGLE_DRIVE_MCP_SERVER_URL;
  if (!mcpServerUrl) {
    return new Response("サーバー設定エラー: GOOGLE_DRIVE_MCP_SERVER_URL が未設定です。", {
      status: 500,
    });
  }

  const body = await request.json().catch(() => null);
  const messages: ChatMessage[] | undefined = body?.messages;
  const outputFormat: OutputFormat | undefined = body?.outputFormat;

  if (!Array.isArray(messages) || messages.length === 0 || !outputFormat) {
    return new Response("リクエストの形式が不正です。", { status: 400 });
  }

  const client = getAnthropicClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (event: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      let anthropicMessages: Anthropic.Beta.BetaMessageParam[] = messages.map(
        (m) => ({ role: m.role, content: m.content }),
      );

      try {
        for (let i = 0; i < MAX_CONTINUATIONS; i++) {
          const mcpStream = client.beta.messages.stream({
            model: CHAT_MODEL,
            max_tokens: CHAT_MAX_TOKENS,
            system: buildSystemPrompt(outputFormat),
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

          mcpStream.on("text", (delta) => sendEvent({ type: "delta", text: delta }));

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
            sendEvent({
              type: "error",
              text: "このリクエストは処理できませんでした。内容を変えて再度お試しください。",
            });
          }

          break;
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
