import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createFileFromContent,
  deleteDriveFile,
  ensureMaterialsFolderId,
  exportFileAsPdf,
  listFolderChildren,
  readDriveFileContent,
  searchDriveFiles,
} from "@/lib/google-drive";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(error: unknown, fallback: string): ToolResult {
  return { content: [{ type: "text", text: error instanceof Error ? error.message : fallback }], isError: true };
}

// このアプリ専用の最小限のGoogle Drive MCPサーバー。
// ログイン中の教員のGoogleアクセストークン（Authorization ヘッダー経由）で
// そのままGoogle Drive APIを呼び出すため、MCPサーバー自身は認証状態を持たない。
export function registerDriveTools(server: McpServer, accessToken: string): void {
  server.registerTool(
    "search_drive_files",
    {
      description:
        "Googleドライブ内のファイルをキーワードで検索する（ファイル名・本文の部分一致）。folderNameを指定すると、そのフォルダ直下に絞り込む。",
      inputSchema: {
        query: z.string().describe("検索キーワード"),
        folderName: z.string().optional().describe("検索対象を絞り込むフォルダ名（省略可）"),
      },
    },
    async ({ query, folderName }) => {
      try {
        const files = await searchDriveFiles(accessToken, { query, folderName });
        if (files.length === 0) return textResult("該当するファイルが見つかりませんでした。");
        return textResult(files.map((f) => `- ${f.name}（id: ${f.id}, 種類: ${f.mimeType}）`).join("\n"));
      } catch (error) {
        return errorResult(error, "検索に失敗しました。");
      }
    },
  );

  server.registerTool(
    "list_drive_folder",
    {
      description: "指定した名前のフォルダ直下にあるファイル・サブフォルダの一覧を取得する。",
      inputSchema: {
        folderName: z.string().describe("一覧を取得するフォルダ名"),
      },
    },
    async ({ folderName }) => {
      try {
        const files = await listFolderChildren(accessToken, folderName);
        if (files.length === 0) return textResult("フォルダが見つからないか、中身が空です。");
        return textResult(files.map((f) => `- ${f.name}（id: ${f.id}, 種類: ${f.mimeType}）`).join("\n"));
      } catch (error) {
        return errorResult(error, "一覧の取得に失敗しました。");
      }
    },
  );

  server.registerTool(
    "read_drive_file",
    {
      description:
        "Googleドキュメント・Googleスプレッドシート・PDFの内容をテキストとして読み取る。PDFはOCR変換して読み取るため数秒かかる場合がある。教科書PDF・資料集PDFは、ファイル名のページ範囲をもとに「--- p.N ---」の見出しでページごとに区切って返す（pagesで必要なページだけを指定できる）。",
      inputSchema: {
        fileId: z.string().describe("読み取るファイルのID（search_drive_files/list_drive_folderの結果から取得）"),
        mimeType: z
          .string()
          .describe(
            "ファイルの種類。application/vnd.google-apps.document / application/vnd.google-apps.spreadsheet / application/pdf のいずれか。",
          ),
        pages: z
          .string()
          .optional()
          .describe(
            "PDFのとき、読み取るページ番号（教科書・資料集に印刷されているページ番号）。例: 「29」「29-30」「27,29」。省略すると全ページを返す。",
          ),
      },
    },
    async ({ fileId, mimeType, pages }) => {
      try {
        const text = await readDriveFileContent(accessToken, fileId, mimeType, { pages });
        const truncated = text.length > 20000 ? `${text.slice(0, 20000)}\n…（文字数上限のため以下省略）` : text;
        return textResult(truncated.trim() || "（内容が空でした）");
      } catch (error) {
        return errorResult(error, "読み取りに失敗しました。");
      }
    },
  );

  server.registerTool(
    "create_google_doc",
    {
      description:
        "「作成教材」フォルダにGoogleドキュメントを新規作成する。htmlContentは見出し(h1〜h3)・太字(strong)・箇条書き(ul/ol)・改ページ（<div style=\"page-break-before:always\"></div>）などを含む簡単なHTMLで記述する。",
      inputSchema: {
        title: z.string().describe("ファイル名"),
        htmlContent: z.string().describe("ドキュメントの内容（簡単なHTML）"),
      },
    },
    async ({ title, htmlContent }) => {
      try {
        const folderId = await ensureMaterialsFolderId(accessToken);
        const file = await createFileFromContent(accessToken, {
          name: title,
          targetMimeType: "application/vnd.google-apps.document",
          sourceMimeType: "text/html",
          content: htmlContent,
          parents: [folderId],
        });
        return textResult(`Googleドキュメントを作成しました。\nファイルID: ${file.id}\nリンク: ${file.webViewLink}`);
      } catch (error) {
        return errorResult(error, "ドキュメントの作成に失敗しました。");
      }
    },
  );

  server.registerTool(
    "create_google_sheet",
    {
      description:
        "「作成教材」フォルダにGoogleスプレッドシートを新規作成する。csvContentはカンマ区切りのCSV形式で記述する（1シートのみ対応、複数タブは非対応）。",
      inputSchema: {
        title: z.string().describe("ファイル名"),
        csvContent: z.string().describe("CSV形式の表データ"),
      },
    },
    async ({ title, csvContent }) => {
      try {
        const folderId = await ensureMaterialsFolderId(accessToken);
        const file = await createFileFromContent(accessToken, {
          name: title,
          targetMimeType: "application/vnd.google-apps.spreadsheet",
          sourceMimeType: "text/csv",
          content: csvContent,
          parents: [folderId],
        });
        return textResult(`Googleスプレッドシートを作成しました。\nファイルID: ${file.id}\nリンク: ${file.webViewLink}`);
      } catch (error) {
        return errorResult(error, "スプレッドシートの作成に失敗しました。");
      }
    },
  );

  server.registerTool(
    "export_as_pdf",
    {
      description:
        "作成済みのGoogleドキュメント/スプレッドシートをPDFとして「作成教材」フォルダに保存する。元のファイルは既定で削除される（PDFのみを最終成果物として残すため）。",
      inputSchema: {
        fileId: z.string().describe("PDF化する元ファイル（create_google_doc/create_google_sheetで作成したもの）のID"),
        title: z.string().describe("PDFのファイル名（.pdfの拡張子は自動で付与される）"),
        deleteSource: z.boolean().optional().describe("元のファイルを削除するか（既定: true）"),
      },
    },
    async ({ fileId, title, deleteSource }) => {
      try {
        const pdfBytes = await exportFileAsPdf(accessToken, fileId);
        const folderId = await ensureMaterialsFolderId(accessToken);
        const fileName = title.endsWith(".pdf") ? title : `${title}.pdf`;
        const file = await createFileFromContent(accessToken, {
          name: fileName,
          targetMimeType: "application/pdf",
          sourceMimeType: "application/pdf",
          content: pdfBytes,
          parents: [folderId],
        });
        if (deleteSource !== false) {
          await deleteDriveFile(accessToken, fileId).catch(() => {});
        }
        return textResult(`PDFを作成しました。\nファイルID: ${file.id}\nリンク: ${file.webViewLink}`);
      } catch (error) {
        return errorResult(error, "PDFの作成に失敗しました。");
      }
    },
  );
}
