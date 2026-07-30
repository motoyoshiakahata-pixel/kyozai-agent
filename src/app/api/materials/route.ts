import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/session";
import { listRecentMaterials } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

export async function GET() {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  try {
    const materials = await listRecentMaterials(accessToken);
    return NextResponse.json({ materials });
  } catch (error) {
    console.error("作成教材一覧の取得に失敗しました", error);
    return NextResponse.json(
      { error: "作成教材一覧の取得に失敗しました。" },
      { status: 500 },
    );
  }
}
