// サーバーとクライアントで共有する、教材作成チャットのストリーミングイベント形式。
// NDJSON（1行1JSON）でクライアントに送信する。
export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "status"; text: string }
  | { type: "error"; text: string };

export function describeMcpToolUse(toolName: string): string {
  const name = toolName.toLowerCase();
  if (name.includes("search")) return "Googleドライブを検索しています…";
  if (name.includes("list")) return "ファイル一覧を取得しています…";
  if (name.includes("create")) return "ファイルを作成しています…";
  if (name.includes("copy")) return "ファイルをコピーしています…";
  if (
    name.includes("read") ||
    name.includes("download") ||
    name.includes("content")
  ) {
    return "ファイルの内容を読み込んでいます…";
  }
  if (name.includes("permission")) return "アクセス権限を確認しています…";
  if (name.includes("metadata")) return "ファイル情報を確認しています…";
  return `Googleドライブで操作を実行しています（${toolName}）…`;
}
