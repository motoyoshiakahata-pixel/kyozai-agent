import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

// コスト管理のため、Sonnet系（要件定義書の想定に合わせた最新モデル）・中程度のeffortを既定とする。
export const CHAT_MODEL = "claude-sonnet-5";
export const CHAT_EFFORT = "medium" as const;
export const CHAT_MAX_TOKENS = 16000;

export const MCP_SERVER_NAME = "google-drive";
