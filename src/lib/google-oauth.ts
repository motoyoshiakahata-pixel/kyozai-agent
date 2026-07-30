import "server-only";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

// マイドライブ内の既存教材読み取り・「作成教材」フォルダへの書き込みの両方が必要なため、
// 自身が作成したファイルのみにアクセスできる drive.file ではなく drive スコープを使う。
// forms.body はGoogleフォーム（採点・解説付きの小テスト）の作成に使用する。
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/forms.body",
].join(" ");

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません`);
  }
  return value;
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: getEnv("GOOGLE_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getEnv("GOOGLE_CLIENT_ID"),
      client_secret: getEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: getEnv("GOOGLE_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Googleトークン取得に失敗しました: ${res.status} ${await res.text()}`,
    );
  }

  return res.json();
}

type RefreshedTokens = Pick<
  GoogleTokens,
  "access_token" | "expires_in" | "scope" | "token_type"
>;

export async function refreshAccessToken(
  refreshToken: string,
): Promise<RefreshedTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getEnv("GOOGLE_CLIENT_ID"),
      client_secret: getEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Googleアクセストークンの更新に失敗しました: ${res.status} ${await res.text()}`,
    );
  }

  return res.json();
}

export interface GoogleUserInfo {
  email: string;
  name?: string;
  picture?: string;
}

export async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Googleユーザー情報の取得に失敗しました: ${res.status}`);
  }

  return res.json();
}
