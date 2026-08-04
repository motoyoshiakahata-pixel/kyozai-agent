"use client";

import { useCallback, useState } from "react";
import {
  REFERENCE_FOLDERS,
  driveFolderUrl,
  type DriveFolderAccessResult,
  type DriveFolderAccessStatus,
  type ReferenceFolder,
} from "@/lib/drive-folders";

const STATUS_LABELS: Record<DriveFolderAccessStatus, string> = {
  ok: "接続OK",
  empty: "中身が空",
  not_found: "見つかりません",
  forbidden: "権限がありません",
  error: "エラー",
};

const STATUS_STYLES: Record<DriveFolderAccessStatus, string> = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  empty: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  not_found: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  forbidden: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

interface ReferenceFoldersCardProps {
  /**
   * サーバー側（page.tsx）で実施した疎通確認の結果。ログイン前や確認に失敗した
   * 場合はnullで、定義しているフォルダの一覧だけを表示する。
   */
  initialHealth?: DriveFolderAccessResult[] | null;
  columns?: 1 | 2;
}

export function ReferenceFoldersCard({ initialHealth = null, columns = 1 }: ReferenceFoldersCardProps) {
  const [health, setHealth] = useState<DriveFolderAccessResult[] | null>(initialHealth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/drive/health");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "疎通確認に失敗しました。");
      setHealth(data.folders as DriveFolderAccessResult[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "疎通確認に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  // 疎通確認をしていない場合は、定義しているフォルダをそのまま並べる
  // （その場合はstatusなどの確認結果のフィールドが存在しない）。
  type Row = ReferenceFolder & Partial<Omit<DriveFolderAccessResult, keyof ReferenceFolder>>;
  const rows: Row[] = health ?? REFERENCE_FOLDERS;
  const problemCount = health?.filter((f) => f.status !== "ok").length ?? 0;

  return (
    <section className="card flex flex-col gap-3 rounded-2xl border border-stone-200/80 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-bold text-black dark:text-stone-50">参照フォルダ</h2>
        {initialHealth && (
          <button
            type="button"
            onClick={() => void recheck()}
            disabled={loading}
            className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900"
          >
            {loading ? "確認中…" : "接続を再確認"}
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {health && problemCount > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          {problemCount}件のフォルダに接続できていません。フォルダを移動・削除した場合は、
          <code className="mx-1">src/lib/drive-folders.ts</code>
          のフォルダIDを更新してください。
        </p>
      )}

      <ul
        className={`grid gap-2 text-sm text-stone-600 dark:text-stone-400 ${
          columns === 2 ? "sm:grid-cols-2" : ""
        }`}
      >
        {rows.map((folder) => {
          const status = folder.status;
          return (
            <li
              key={folder.key}
              className="flex flex-col gap-1 rounded-lg bg-stone-50 px-3 py-2 dark:bg-stone-900"
            >
              <div className="flex items-start justify-between gap-2">
                <a
                  href={driveFolderUrl(folder.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-stone-800 underline decoration-stone-300 underline-offset-2 hover:text-accent dark:text-stone-200 dark:decoration-stone-700"
                >
                  {folder.actualName ?? folder.name}
                </a>
                {status && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
                  >
                    {STATUS_LABELS[status]}
                  </span>
                )}
              </div>
              <span className="text-xs">{folder.description}</span>
              {folder.status === "ok" && (
                <span className="text-xs text-stone-500 dark:text-stone-500">
                  {folder.fileCount}件（例: {(folder.sampleFileNames ?? []).slice(0, 2).join("、")}）
                </span>
              )}
              {folder.message && (
                <span className="text-xs text-red-600 dark:text-red-400">{folder.message}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
