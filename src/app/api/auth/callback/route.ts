import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
} from "@/lib/google-oauth";
import { createSession } from "@/lib/session";

const STATE_COOKIE = "oauth_state";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (oauthError) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(oauthError)}`, request.url),
    );
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      new URL("/?error=invalid_state", request.url),
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const userInfo = await fetchGoogleUserInfo(tokens.access_token);

    await createSession({
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
    });
  } catch (err) {
    console.error("Google OAuthコールバック処理に失敗しました", err);
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
  }

  return NextResponse.redirect(new URL("/", request.url));
}
