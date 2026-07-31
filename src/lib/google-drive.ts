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

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolderIdByName(accessToken: string, name: string): Promise<string | null> {
  const folderResult = await driveFilesList(accessToken, {
    q: `name = '${escapeDriveQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    pageSize: "1",
  });

  return folderResult.files?.[0]?.id ?? null;
}

async function findMaterialsFolderId(accessToken: string): Promise<string | null> {
  return findFolderIdByName(accessToken, MATERIALS_FOLDER_NAME);
}

export interface DriveSearchResult {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
}

// キーワードでGoogleドライブ内のファイルを検索する。folderNameを指定すると、
// そのフォルダ直下に絞り込む。
export async function searchDriveFiles(
  accessToken: string,
  params: { query: string; folderName?: string },
): Promise<DriveSearchResult[]> {
  const clauses = ["trashed = false"];

  if (params.folderName) {
    const folderId = await findFolderIdByName(accessToken, params.folderName);
    if (!folderId) return [];
    clauses.push(`'${folderId}' in parents`);
  }

  const escapedQuery = escapeDriveQueryValue(params.query);
  clauses.push(`(name contains '${escapedQuery}' or fullText contains '${escapedQuery}')`);

  const result = await driveFilesList(accessToken, {
    q: clauses.join(" and "),
    fields: "files(id,name,mimeType,webViewLink)",
    pageSize: "20",
  });

  return result.files ?? [];
}

// 指定した名前のフォルダ直下にあるファイル・サブフォルダの一覧を取得する。
export async function listFolderChildren(accessToken: string, folderName: string): Promise<DriveSearchResult[]> {
  const folderId = await findFolderIdByName(accessToken, folderName);
  if (!folderId) return [];

  const result = await driveFilesList(accessToken, {
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,webViewLink)",
    orderBy: "name",
    pageSize: "100",
  });

  return result.files ?? [];
}

async function exportFileAsText(accessToken: string, fileId: string, mimeType: string): Promise<string> {
  const res = await fetch(
    `${DRIVE_FILES_URL}/${fileId}/export?mimeType=${encodeURIComponent(mimeType)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    throw new Error(`ファイルの読み取りに失敗しました: ${res.status}`);
  }

  return res.text();
}

// Googleドキュメント/スプレッドシート/PDFの内容をテキストとして読み取る。
// PDFはネイティブのテキストを持たないため、一時的にGoogleドキュメントへ
// コピー（Drive側でOCR変換）してからテキストを抽出し、コピーは削除する。
export async function readDriveFileContent(
  accessToken: string,
  fileId: string,
  mimeType: string,
): Promise<string> {
  if (mimeType === "application/vnd.google-apps.document") {
    return exportFileAsText(accessToken, fileId, "text/plain");
  }
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    return exportFileAsText(accessToken, fileId, "text/csv");
  }
  if (mimeType === "application/pdf") {
    const copyRes = await fetch(`${DRIVE_FILES_URL}/${fileId}/copy?fields=id`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mimeType: "application/vnd.google-apps.document" }),
    });
    if (!copyRes.ok) {
      throw new Error(`PDFのテキスト変換に失敗しました: ${copyRes.status}`);
    }
    const copy: { id: string } = await copyRes.json();
    try {
      return await exportFileAsText(accessToken, copy.id, "text/plain");
    } finally {
      await fetch(`${DRIVE_FILES_URL}/${copy.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {});
    }
  }
  throw new Error(
    "このファイル形式は読み取れません（対応形式: Googleドキュメント・Googleスプレッドシート・PDF）。",
  );
}

const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

async function driveMultipartUpload(
  accessToken: string,
  metadata: Record<string, unknown>,
  media: { mimeType: string; body: string | Uint8Array },
): Promise<DriveMaterial> {
  const boundary = `kyozai_agent_${crypto.randomUUID()}`;
  const encoder = new TextEncoder();

  const metadataPart = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
  );
  const mediaHeader = encoder.encode(`--${boundary}\r\nContent-Type: ${media.mimeType}\r\n\r\n`);
  const mediaBody = typeof media.body === "string" ? encoder.encode(media.body) : media.body;
  const closing = encoder.encode(`\r\n--${boundary}--`);

  const res = await fetch(
    `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,mimeType,webViewLink,createdTime`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: new Blob([metadataPart, mediaHeader, mediaBody as BlobPart, closing]),
    },
  );

  if (!res.ok) {
    throw new Error(`Google Driveへのファイル作成に失敗しました: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

// HTML/CSV/PDFなどのコンテンツをアップロードし、Googleドライブ上のファイル
// （必要に応じてGoogleドキュメント/スプレッドシートへ自動変換）として作成する。
export async function createFileFromContent(
  accessToken: string,
  params: {
    name: string;
    targetMimeType: string;
    sourceMimeType: string;
    content: string | Uint8Array;
    parents?: string[];
  },
): Promise<DriveMaterial> {
  const metadata: Record<string, unknown> = { name: params.name, mimeType: params.targetMimeType };
  if (params.parents) metadata.parents = params.parents;

  return driveMultipartUpload(accessToken, metadata, {
    mimeType: params.sourceMimeType,
    body: params.content,
  });
}

// 作成済みのGoogleドキュメント/スプレッドシートをPDFバイト列としてエクスポートする。
export async function exportFileAsPdf(accessToken: string, fileId: string): Promise<Uint8Array> {
  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}/export?mimeType=application/pdf`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`PDFへの変換に失敗しました: ${res.status}`);
  }

  return new Uint8Array(await res.arrayBuffer());
}

export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`ファイルの削除に失敗しました: ${res.status}`);
  }
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
