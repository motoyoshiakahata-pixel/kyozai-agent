import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildGoogleAuthUrl } from "@/lib/google-oauth";
import { getGoogleRedirectUri } from "@/lib/app-url";

const STATE_COOKIE = "oauth_state";

export async function GET() {
  const redirectUri = await getGoogleRedirectUri();
  if (!redirectUri) {
    return new NextResponse(
      "サーバー設定エラー: コールバックURLを判別できませんでした。環境変数 GOOGLE_REDIRECT_URI を設定してください。",
      { status: 500 },
    );
  }

  const state = crypto.randomUUID();

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return NextResponse.redirect(buildGoogleAuthUrl(state, redirectUri));
}
