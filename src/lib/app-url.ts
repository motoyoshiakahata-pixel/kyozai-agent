import "server-only";
import { headers } from "next/headers";

// このアプリが今アクセスされているURL（オリジン）を、リクエストヘッダーから求める。
//
// デプロイ先のURLを環境変数に手で設定しなくても済むようにするための仕組み。
// Vercelなどのホスティングではリバースプロキシを通るため、元のホスト名・
// プロトコルは x-forwarded-* ヘッダーに入る。
export async function getAppOrigin(): Promise<string | null> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) return null;

  const forwardedProto = headerList.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const protocol = forwardedProto ?? (isLocal ? "http" : "https");

  return `${protocol}://${host}`;
}

// Google OAuthのコールバックURL。
// GOOGLE_REDIRECT_URIが設定されていればそれを優先し、なければ現在のURLから組み立てる。
// ここで返す値は、Google Cloud Consoleの「承認済みのリダイレクトURI」に
// 登録されている必要がある。
export async function getGoogleRedirectUri(): Promise<string | null> {
  const configured = process.env.GOOGLE_REDIRECT_URI;
  if (configured) return configured;

  const origin = await getAppOrigin();
  return origin ? `${origin}/api/auth/callback` : null;
}

// Anthropic APIに渡す、このアプリ自身のMCPサーバーのURL。
// Anthropic側のサーバーから呼び出されるため、インターネットから到達できる
// https のURLである必要がある（localhostは不可）。
export async function getMcpServerUrl(): Promise<string | null> {
  const configured = process.env.GOOGLE_DRIVE_MCP_SERVER_URL;
  if (configured) return configured;

  const origin = await getAppOrigin();
  if (origin?.startsWith("https://")) return `${origin}/api/mcp`;

  // ヘッダーから求められない場合の保険（Vercelの環境変数）。
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/mcp`;

  return null;
}

export interface SetupStatus {
  /** 未設定の環境変数名 */
  missingEnvVars: string[];
  /** Google Cloud Consoleに登録すべきリダイレクトURI */
  redirectUri: string | null;
  /** MCPサーバーのURL（インターネットから到達できる必要がある） */
  mcpServerUrl: string | null;
  ready: boolean;
}

// デプロイ後の設定漏れを画面上で確認できるようにするための状態チェック。
// 値そのものは決して画面に出さず、設定済みかどうかだけを返す。
export async function checkSetup(): Promise<SetupStatus> {
  const requiredEnvVars = [
    "ANTHROPIC_API_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "AUTH_SECRET",
  ];
  const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);

  const [redirectUri, mcpServerUrl] = await Promise.all([
    getGoogleRedirectUri(),
    getMcpServerUrl(),
  ]);

  return {
    missingEnvVars,
    redirectUri,
    mcpServerUrl,
    ready: missingEnvVars.length === 0 && redirectUri !== null && mcpServerUrl !== null,
  };
}
