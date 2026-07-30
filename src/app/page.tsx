import { getSession } from "@/lib/session";

const referenceFolders = [
  "「公共」教科書PDF（章単位）",
  "「公共」教科書PDF（単元・ページ範囲別）",
  "「公共」章ごとのサブフォルダ構造",
  "カラー版／モノクロ版の教材フォルダ",
  "過去問アーカイブ（センター試験1997〜2020年、共通テスト2021年〜）",
];

const outputFormats = ["Googleドキュメント", "Googleスプレッドシート", "PDF"];

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
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-16 sm:px-10">
        <header className="flex flex-col gap-3">
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            教材作成AIエージェント
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            高校「公共」の教材づくりを、AIエージェントと。
          </h1>
          <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Googleドライブに保存済みの教科書PDF・過去問を参照しながら、指示に応じて新しい問題やプリントを作成し、専用フォルダに保存します。
          </p>
        </header>

        {errorMessage && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {errorMessage}
          </p>
        )}

        <section className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          {session ? (
            <>
              <span className="text-zinc-600 dark:text-zinc-400">
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
                className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Googleでログイン
              </a>
            </>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
            参照フォルダ
          </h2>
          <ul className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            {referenceFolders.map((folder) => (
              <li key={folder} className="flex items-start gap-2">
                <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                {folder}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
            出力形式
          </h2>
          <div className="flex flex-wrap gap-2">
            {outputFormats.map((format) => (
              <span
                key={format}
                className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              >
                {format}
              </span>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2 rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          <p className="font-medium text-zinc-700 dark:text-zinc-300">
            準備中
          </p>
          <p>
            Claude APIとの連携、教材生成チャットUIはこれから実装します。
          </p>
        </section>
      </main>
    </div>
  );
}
