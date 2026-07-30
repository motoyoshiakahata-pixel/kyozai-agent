interface ReferenceFoldersCardProps {
  folders: string[];
  columns?: 1 | 2;
}

export function ReferenceFoldersCard({ folders, columns = 1 }: ReferenceFoldersCardProps) {
  return (
    <section className="card flex flex-col gap-3 rounded-2xl border border-stone-200/80 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
      <h2 className="font-serif text-lg font-bold text-black dark:text-stone-50">参照フォルダ</h2>
      <ul
        className={`grid gap-2 text-sm text-stone-600 dark:text-stone-400 ${
          columns === 2 ? "sm:grid-cols-2" : ""
        }`}
      >
        {folders.map((folder) => (
          <li
            key={folder}
            className="flex items-start gap-2 rounded-lg bg-stone-50 px-3 py-2 dark:bg-stone-900"
          >
            <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            {folder}
          </li>
        ))}
      </ul>
    </section>
  );
}
