import type { NextRequest } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerDriveTools } from "@/lib/drive-mcp-tools";

export const dynamic = "force-dynamic";
// Vercel Hobby(無料)プランで設定可能な上限に合わせる。
export const maxDuration = 60;

// このアプリ専用のGoogle Drive MCPサーバー（Streamable HTTP、ステートレス）。
// Anthropic APIのmcp_connectorが、ログイン中の教員のGoogleアクセストークンを
// Authorizationヘッダーに乗せて呼び出す（/api/chat/route.tsのauthorization_token）。
// セッションを保持しないステートレス構成にしているため、サーバーレス環境で
// リクエストごとに別インスタンスで処理されても問題ない。
async function handleMcpRequest(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: "Authorizationヘッダー（Googleアクセストークン）がありません。" },
        id: null,
      },
      { status: 401 },
    );
  }

  const server = new McpServer({ name: "kyozai-agent-google-drive", version: "1.0.0" });
  registerDriveTools(server, accessToken);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  return transport.handleRequest(request);
}

export const POST = handleMcpRequest;
export const GET = handleMcpRequest;
export const DELETE = handleMcpRequest;
