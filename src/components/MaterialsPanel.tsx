"use client";

import { useCallback, useEffect, useState } from "react";

interface Material {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  createdTime: string;
}

interface FormQuestionStat {
  questionId: string;
  title: string;
  correctCount: number;
  gradedCount: number;
  correctRate: number | null;
  maxPoints: number;
}

interface FormAnalysis {
  totalResponses: number;
  averageScorePercent: number | null;
  questions: FormQuestionStat[];
}

type AnalysisState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; data: FormAnalysis };

const FORM_MIME_TYPE = "application/vnd.google-apps.form";

function formatTypeLabel(mimeType: string): string {
  if (mimeType === "application/vnd.google-apps.document") return "Doc";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "Sheet";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === FORM_MIME_TYPE) return "Form";
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

function rateTextColor(rate: number | null): string {
  if (rate === null) return "text-stone-400 dark:text-stone-500";
  if (rate < 0.5) return "text-red-600 dark:text-red-400";
  if (rate < 0.8) return "text-amber-600 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
}

function rateBarColor(rate: number | null): string {
  if (rate === null) return "bg-stone-300 dark:bg-stone-600";
  if (rate < 0.5) return "bg-red-500";
  if (rate < 0.8) return "bg-amber-500";
  return "bg-green-500";
}

function FormAnalysisPanel({ state }: { state: AnalysisState | undefined }) {
  if (!state || state.status === "loading") {
    return <p className="pl-1 text-xs text-stone-500 dark:text-stone-400">読み込み中…</p>;
  }
  if (state.status === "error") {
    return <p className="pl-1 text-xs text-red-600 dark:text-red-400">{state.message}</p>;
  }

  const { data } = state;
  if (data.totalResponses === 0) {
    return <p className="pl-1 text-xs text-stone-500 dark:text-stone-400">まだ回答がありません。</p>;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-stone-50 p-3 dark:bg-stone-900">
      <p className="text-xs text-stone-600 dark:text-stone-400">
        回答数: {data.totalResponses}件
        {data.averageScorePercent !== null && ` ・ 平均得点率: ${Math.round(data.averageScorePercent)}%`}
      </p>
      <ul className="flex flex-col gap-1.5">
        {data.questions.map((question) => (
          <li key={question.questionId} className="flex items-center gap-2">
            <span className={`w-9 shrink-0 text-right text-xs font-semibold ${rateTextColor(question.correctRate)}`}>
              {question.correctRate !== null ? `${Math.round(question.correctRate * 100)}%` : "—"}
            </span>
            <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
              <div
                className={`h-full rounded-full ${rateBarColor(question.correctRate)}`}
                style={{ width: `${question.correctRate !== null ? Math.round(question.correctRate * 100) : 0}%` }}
              />
            </div>
            <span className="min-w-0 flex-1 truncate text-xs text-stone-700 dark:text-stone-300">
              {question.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MaterialsPanel({ refreshSignal }: { refreshSignal: number }) {
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analysisById, setAnalysisById] = useState<Record<string, AnalysisState>>({});

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

  function toggleAnalysis(material: Material) {
    if (expandedId === material.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(material.id);
    if (analysisById[material.id]) return;

    setAnalysisById((prev) => ({ ...prev, [material.id]: { status: "loading" } }));
    fetch(`/api/materials/analyze?fileId=${encodeURIComponent(material.id)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error ?? "取得に失敗しました。");
        }
        setAnalysisById((prev) => ({ ...prev, [material.id]: { status: "loaded", data: data.analysis } }));
      })
      .catch((err: unknown) => {
        setAnalysisById((prev) => ({
          ...prev,
          [material.id]: {
            status: "error",
            message: err instanceof Error ? err.message : "取得に失敗しました。",
          },
        }));
      });
  }

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
            <li key={material.id} className="flex flex-col gap-2 py-2">
              <div className="flex items-center justify-between gap-3">
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
                  {material.mimeType === FORM_MIME_TYPE && (
                    <button
                      type="button"
                      onClick={() => toggleAnalysis(material)}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      {expandedId === material.id ? "分析を閉じる" : "回答を分析"}
                    </button>
                  )}
                  <a
                    href={material.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    開く
                  </a>
                </div>
              </div>
              {expandedId === material.id && <FormAnalysisPanel state={analysisById[material.id]} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
