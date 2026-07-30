const referenceFolders = [
  "「公共」教科書PDF（章単位）",
  "「公共」教科書PDF（単元・ページ範囲別）",
  "「公共」章ごとのサブフォルダ構造",
  "カラー版／モノクロ版の教材フォルダ",
  "過去問アーカイブ（センター試験1997〜2020年、共通テスト2021年〜）",
];

const outputFormats = ["Googleドキュメント", "Googleスプレッドシート", "PDF"];

export default function Home() {
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
            Google OAuth認証、Claude
            APIとの連携、教材生成チャットUIはこれから実装します。
          </p>
        </section>
      </main>
    </div>
  );
}
