import { getSession } from "@/lib/session";
import { Workspace } from "@/components/Workspace";
import { ReferenceFoldersCard } from "@/components/ReferenceFoldersCard";
import { OUTPUT_FORMAT_LABELS } from "@/lib/prompts";

const referenceFolders = [
  "「公共」教科書PDF（章単位）",
  "「公共」教科書PDF（単元・ページ範囲別）",
  "「公共」章ごとのサブフォルダ構造",
  "カラー版／モノクロ版の教材フォルダ",
  "過去問アーカイブ（センター試験1997〜2020年、共通テスト2021年〜）",
];

const outputFormats = Object.values(OUTPUT_FORMAT_LABELS);

const errorMessages: Record<string, string> = {
  invalid_state: "認証セッションが無効です。もう一度お試しください。",
  auth_failed: "Google認証に失敗しました。もう一度お試しください。",
  access_denied: "Googleアカウントへのアクセスが許可されませんでした。",
};

export default async function Home(props: PageProps<"/">) {
  const [session, searchParams] = await Promise.all([
    getSession(),
    props.searchParams,
  ]);

  const errorParam = searchParams?.error;
  const errorCode = Array.isArray(errorParam) ? errorParam[0] : errorParam;
  const errorMessage = errorCode
    ? (errorMessages[errorCode] ?? "エラーが発生しました。もう一度お試しください。")
    : null;

  return (
    <div className="flex flex-1 flex-col items-center border-t-4 border-accent bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-16 sm:px-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
          <header className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-indigo-950 font-serif text-lg font-bold text-white shadow-md">
                公
              </span>
              <div className="flex flex-col">
                <span className="font-serif text-base font-bold tracking-wide text-black dark:text-zinc-50">
                  教材作成AIエージェント
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  高校公民科「公共」 教材支援ツール
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-l-2 border-accent/30 pl-5">
              <h1 className="font-serif text-3xl font-bold tracking-tight text-black sm:text-4xl dark:text-zinc-50">
                高校「公共」の教材づくりを、
                <br className="hidden sm:block" />
                AIエージェントと。
              </h1>
              <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
                Googleドライブに保存済みの教科書PDF・過去問を参照しながら、指示に応じて新しい問題やプリントを作成し、専用フォルダに保存します。
              </p>
            </div>
          </header>

          {errorMessage && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {errorMessage}
            </p>
          )}

          <section className="card flex items-center justify-between gap-4 rounded-2xl border border-zinc-200/80 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
            {session ? (
              <>
                <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                    {(session.name ?? session.email ?? "?").slice(0, 1)}
                  </span>
                  {session.name ?? session.email} としてログイン中
                </span>
                <form action="/api/auth/logout" method="post">
                  <button
                    type="submit"
                    className="rounded-full border border-zinc-300 px-4 py-1.5 text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    ログアウト
                  </button>
                </form>
              </>
            ) : (
              <>
                <span className="text-zinc-600 dark:text-zinc-400">
                  Googleドライブと連携するにはログインが必要です
                </span>
                <a
                  href="/api/auth/login"
                  className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground shadow-sm transition-colors hover:brightness-110"
                >
                  Googleでログイン
                </a>
              </>
            )}
          </section>
        </div>

        {session ? (
          <Workspace referenceFolders={referenceFolders} />
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
            <ReferenceFoldersCard folders={referenceFolders} columns={2} />
            <section className="card flex flex-col gap-3 rounded-2xl border border-zinc-200/80 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="font-serif text-lg font-bold text-black dark:text-zinc-50">
                出力形式
              </h2>
              <div className="flex flex-wrap gap-2">
                {outputFormats.map((format) => (
                  <span
                    key={format}
                    className="rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-sm text-accent"
                  >
                    {format}
                  </span>
                ))}
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                教材作成チャットを利用するにはGoogleでログインしてください。
              </p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
