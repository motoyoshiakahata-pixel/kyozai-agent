"use client";

import { useState } from "react";
import type { SetupStatus } from "@/lib/app-url";

const ENV_VAR_LABELS: Record<string, string> = {
  ANTHROPIC_API_KEY: "Anthropic APIキー",
  GOOGLE_CLIENT_ID: "GoogleクライアントID",
  GOOGLE_CLIENT_SECRET: "Googleクライアントシークレット",
  AUTH_SECRET: "セッション暗号化キー",
};

function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <span className="flex flex-wrap items-center gap-2">
      <code className="break-all rounded bg-stone-100 px-2 py-1 text-xs dark:bg-stone-900">{url}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="shrink-0 rounded-full border border-stone-300 px-2 py-0.5 text-xs text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900"
      >
        {copied ? "コピーしました" : "コピー"}
      </button>
    </span>
  );
}

// デプロイ直後の設定漏れを画面上で確認するためのカード。
// 環境変数の値そのものは表示せず、設定済みかどうかだけを示す。
export function SetupStatusCard({ status }: { status: SetupStatus }) {
  const hasMissingEnvVars = status.missingEnvVars.length > 0;

  return (
    <section className="card flex flex-col gap-4 rounded-2xl border border-stone-200/80 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
      <div className="flex items-center gap-2">
        <h2 className="font-serif text-lg font-bold text-black dark:text-stone-50">セットアップ状況</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            status.ready
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          }`}
        >
          {status.ready ? "設定完了" : "未完了"}
        </span>
      </div>

      {hasMissingEnvVars ? (
        <div className="flex flex-col gap-2 text-sm text-stone-600 dark:text-stone-400">
          <p className="text-amber-800 dark:text-amber-300">
            次の設定が見つかりません。デプロイ先（Vercel）の環境変数に追加して、再デプロイしてください。
          </p>
          <ul className="flex flex-col gap-1">
            {status.missingEnvVars.map((name) => (
              <li key={name} className="rounded-lg bg-stone-50 px-3 py-2 dark:bg-stone-900">
                <span className="font-medium text-stone-800 dark:text-stone-200">
                  {ENV_VAR_LABELS[name] ?? name}
                </span>
                <code className="ml-2 text-xs">{name}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-stone-600 dark:text-stone-400">
          必要な設定（Anthropic APIキー・Google認証情報・セッション暗号化キー）はすべて登録されています。
        </p>
      )}

      {status.redirectUri && (
        <div className="flex flex-col gap-2 text-sm text-stone-600 dark:text-stone-400">
          <p className="font-medium text-stone-800 dark:text-stone-200">
            Google Cloud Consoleに登録するリダイレクトURI
          </p>
          <p className="text-xs">
            Google Cloud Consoleの「APIとサービス」→「認証情報」→ OAuth 2.0 クライアントID →「承認済みのリダイレクトURI」に、下のURLをそのまま貼り付けてください。
          </p>
          <CopyableUrl url={status.redirectUri} />
        </div>
      )}

      {!status.mcpServerUrl && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          このアプリのURLがインターネットから見えるhttpsのURLではないため、教材作成チャットは動きません（ローカルで動かしている場合はこの表示で正常です）。
        </p>
      )}
    </section>
  );
}
