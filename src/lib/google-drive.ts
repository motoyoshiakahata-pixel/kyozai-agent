import "server-only";

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const MATERIALS_FOLDER_NAME = "作成教材";

export interface DriveMaterial {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  createdTime: string;
}

async function driveFilesList(
  accessToken: string,
  params: Record<string, string>,
): Promise<{ files?: DriveMaterial[] }> {
  const url = `${DRIVE_FILES_URL}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Google Drive APIの呼び出しに失敗しました: ${res.status}`);
  }

  return res.json();
}

// マイドライブ直下の「作成教材」フォルダから、直近作成されたファイルを取得する。
export async function listRecentMaterials(
  accessToken: string,
  limit = 10,
): Promise<DriveMaterial[]> {
  const folderResult = await driveFilesList(accessToken, {
    q: `name = '${MATERIALS_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    pageSize: "1",
  });

  const folderId = folderResult.files?.[0]?.id;
  if (!folderId) return [];

  const filesResult = await driveFilesList(accessToken, {
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,webViewLink,createdTime)",
    orderBy: "createdTime desc",
    pageSize: String(limit),
  });

  return filesResult.files ?? [];
}
