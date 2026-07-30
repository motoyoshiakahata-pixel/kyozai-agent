import type { NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { getValidAccessToken } from "@/lib/session";
import {
  getAnthropicClient,
  CHAT_MODEL,
  CHAT_EFFORT,
  CHAT_MAX_TOKENS,
  MCP_SERVER_NAME,
} from "@/lib/anthropic";
import { buildSystemPrompt, type OutputFormat } from "@/lib/prompts";

export const dynamic = "force-dynamic";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_CONTINUATIONS = 3;

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
      const send = (text: string) => controller.enqueue(encoder.encode(text));

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

          mcpStream.on("text", (delta) => send(delta));

          const finalMessage = await mcpStream.finalMessage();

          if (finalMessage.stop_reason === "pause_turn") {
            anthropicMessages = [
              ...anthropicMessages,
              { role: "assistant", content: finalMessage.content },
            ];
            continue;
          }

          if (finalMessage.stop_reason === "refusal") {
            send(
              "\n\n[このリクエストは処理できませんでした。内容を変えて再度お試しください。]",
            );
          }

          break;
        }
      } catch (error) {
        console.error("Anthropic API呼び出しに失敗しました", error);
        send("\n\n[エラーが発生しました。しばらくしてから再度お試しください。]");
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
