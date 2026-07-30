import { type NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/session";
import { analyzeFormResponses } from "@/lib/google-forms";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const fileId = request.nextUrl.searchParams.get("fileId");
  if (!fileId) {
    return NextResponse.json({ error: "fileIdが指定されていません。" }, { status: 400 });
  }

  try {
    const analysis = await analyzeFormResponses(accessToken, fileId);
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("Googleフォームの回答分析に失敗しました", error);
    const isPermissionError = error instanceof Error && /\b(401|403)\b/.test(error.message);
    return NextResponse.json(
      {
        error: isPermissionError
          ? "回答結果の取得権限がありません。一度ログアウトしてから再度Googleでログインし、フォーム回答へのアクセスを許可してください。"
          : "回答結果の取得に失敗しました。",
      },
      { status: isPermissionError ? 403 : 500 },
    );
  }
}
