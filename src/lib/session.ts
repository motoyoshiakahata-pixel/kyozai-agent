import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { refreshAccessToken } from "@/lib/google-oauth";

const SESSION_COOKIE = "session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30日
const ACCESS_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000; // 5分前から更新扱い

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("環境変数 AUTH_SECRET が設定されていません");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload extends JWTPayload {
  email: string;
  name?: string;
  picture?: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: number;
}

async function encryptSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + SESSION_DURATION_MS) / 1000))
    .sign(getSecretKey());
}

async function decryptSession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

async function setSessionCookie(payload: SessionPayload) {
  const token = await encryptSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function createSession(payload: SessionPayload) {
  await setSessionCookie(payload);
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// Cookieの読み取りのみ。Server Component（ページ）からはこちらを使う。
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return decryptSession(cookieStore.get(SESSION_COOKIE)?.value);
}

// アクセストークンの期限切れが近ければリフレッシュしてCookieを更新する。
// Cookieの書き込みを伴うため、Route HandlerやServer Actionからのみ呼び出すこと
//（Server Componentのレンダリング中はCookieの書き込みができないため）。
export async function getValidAccessToken(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;

  const willExpireSoon =
    session.accessTokenExpiresAt - Date.now() < ACCESS_TOKEN_REFRESH_MARGIN_MS;
  if (!willExpireSoon || !session.refreshToken) {
    return session.accessToken;
  }

  const refreshed = await refreshAccessToken(session.refreshToken);
  const updated: SessionPayload = {
    ...session,
    accessToken: refreshed.access_token,
    accessTokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
  };
  await setSessionCookie(updated);
  return updated.accessToken;
}
