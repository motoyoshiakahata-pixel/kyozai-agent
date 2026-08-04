import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/session";
import { checkReferenceFolders } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

// 参照フォルダ（教材フォルダ・問題モデルフォルダ）への疎通確認。
// 教材を作り始める前に、必要な資料に実際に到達できるかをここで確かめる。
export async function GET() {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  try {
    const folders = await checkReferenceFolders(accessToken);
    // 必須フォルダがすべて読める状態であれば、教材作成に進んでよい。
    const ready = folders.every((folder) => !folder.required || folder.status === "ok");
    return NextResponse.json({ ready, folders });
  } catch (error) {
    console.error("参照フォルダの疎通確認に失敗しました", error);
    return NextResponse.json(
      { error: "参照フォルダの疎通確認に失敗しました。" },
      { status: 500 },
    );
  }
}
