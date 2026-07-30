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

async function findMaterialsFolderId(accessToken: string): Promise<string | null> {
  const folderResult = await driveFilesList(accessToken, {
    q: `name = '${MATERIALS_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    pageSize: "1",
  });

  return folderResult.files?.[0]?.id ?? null;
}

// マイドライブ直下の「作成教材」フォルダから、直近作成されたファイルを取得する。
export async function listRecentMaterials(
  accessToken: string,
  limit = 10,
): Promise<DriveMaterial[]> {
  const folderId = await findMaterialsFolderId(accessToken);
  if (!folderId) return [];

  const filesResult = await driveFilesList(accessToken, {
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,webViewLink,createdTime)",
    orderBy: "createdTime desc",
    pageSize: String(limit),
  });

  return filesResult.files ?? [];
}

// 「作成教材」フォルダのIDを取得する。存在しない場合はマイドライブ直下に作成する。
export async function ensureMaterialsFolderId(accessToken: string): Promise<string> {
  const existingFolderId = await findMaterialsFolderId(accessToken);
  if (existingFolderId) return existingFolderId;

  const res = await fetch(DRIVE_FILES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: MATERIALS_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  if (!res.ok) {
    throw new Error(`「作成教材」フォルダの作成に失敗しました: ${res.status}`);
  }

  const created: { id: string } = await res.json();
  return created.id;
}

// Googleフォームなど、Forms APIなどマイドライブ直下に作成されるファイルを
// 「作成教材」フォルダに移動する。
export async function moveFileToMaterialsFolder(
  accessToken: string,
  fileId: string,
): Promise<void> {
  const folderId = await ensureMaterialsFolderId(accessToken);

  const res = await fetch(
    `${DRIVE_FILES_URL}/${fileId}?addParents=${folderId}&removeParents=root&fields=id,parents`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!res.ok) {
    throw new Error(`ファイルの移動に失敗しました: ${res.status}`);
  }
}
