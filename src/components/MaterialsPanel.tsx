"use client";

import { useCallback, useEffect, useState } from "react";

interface Material {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  createdTime: string;
}

function formatTypeLabel(mimeType: string): string {
  if (mimeType === "application/vnd.google-apps.document") return "Doc";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "Sheet";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "application/vnd.google-apps.form") return "Form";
  return "File";
}

function formatCreatedTime(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function MaterialsPanel({ refreshSignal }: { refreshSignal: number }) {
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/materials");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "取得に失敗しました。");
      }
      setMaterials(data.materials);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  return (
    <section className="card flex flex-col gap-3 rounded-2xl border border-stone-200/80 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-lg font-bold text-black dark:text-stone-50">
          作成履歴
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="text-xs text-stone-500 underline decoration-dotted hover:text-accent disabled:opacity-50 dark:text-stone-400"
        >
          更新
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!error && materials !== null && materials.length === 0 && (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          「作成教材」フォルダにはまだファイルがありません。
        </p>
      )}

      {!error && materials === null && (
        <p className="text-sm text-stone-500 dark:text-stone-400">読み込み中…</p>
      )}

      {materials && materials.length > 0 && (
        <ul className="flex flex-col divide-y divide-stone-100 dark:divide-stone-900">
          {materials.map((material) => (
            <li key={material.id} className="flex items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-accent">
                  {formatTypeLabel(material.mimeType)}
                </span>
                <span className="truncate text-sm text-stone-700 dark:text-stone-300">
                  {material.name}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-stone-400 dark:text-stone-500">
                  {formatCreatedTime(material.createdTime)}
                </span>
                <a
                  href={material.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-accent hover:underline"
                >
                  開く
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
