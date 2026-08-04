// 教科書PDF・資料集PDFのページ番号を扱うユーティリティ。
//
// 背景: 資料集PDFはスキャン画像で、Drive側のOCR変換を通してのみテキスト化できる。
// OCRテキストにはページ下部のノンブル（ページ番号）が「その行だけ数字」という形で
// 残るため、ファイル名のページ範囲（例: 「27-30 伝統文化.pdf」）と突き合わせることで
// 本文を実際のページに割り当てられる。
//
// ただしOCRは読み取り順が乱れることがあり、割り当ては完全ではない。そのため
// 「ページ区切りを特定できたか（confident）」を必ず呼び出し側に返し、特定できない
// 場合はページ単位ではなくファイル名の範囲で出典を示させる。

export interface PageRange {
  start: number;
  end: number;
}

export interface ReferencePage {
  page: number;
  text: string;
}

export interface PagedDocument {
  range: PageRange | null;
  pages: ReferencePage[];
  /** ページ区切りを特定できたか。falseのときページ番号を出典として使ってはいけない */
  confident: boolean;
}

// ファイル名からページ範囲を読み取る。
// 対応する書き方:
//   「公共_1-1_第1部第1章（p.10-13）.pdf」 … 括弧つきのp.表記（教科書PDF）
//   「27-30 伝統文化.pdf」「179-180景気変動と物価.pdf」 … 先頭の範囲（資料集PDF）
//   「146-149世論と政治参加.pdf」
export function parsePageRangeFromFileName(fileName: string): PageRange | null {
  const dash = "[-–—〜~ー]";
  const patterns = [
    new RegExp(`[（(]\\s*[pP]\\s*\\.?\\s*(\\d{1,3})\\s*${dash}\\s*(\\d{1,3})\\s*[）)]`),
    new RegExp(`^\\s*(\\d{1,3})\\s*${dash}\\s*(\\d{1,3})(?!\\d)`),
  ];

  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (!match) continue;

    const start = Number(match[1]);
    const end = Number(match[2]);
    // 「1-1」のような章番号や、明らかに範囲として不自然なものは除く。
    if (start < 1 || end < start || end - start > 60) continue;
    return { start, end };
  }

  return null;
}

// 行がページ番号だけの行（ノンブル）かどうか。
// 「(Op.144)」のような相互参照は行の一部なので一致しない。
function isPageMarker(line: string, page: number): boolean {
  return line.trim() === String(page);
}

// OCRテキストを、ページ下部のノンブルを手がかりにページごとに分割する。
export function splitTextIntoPages(text: string, range: PageRange | null): PagedDocument {
  if (!range) {
    return { range: null, pages: [], confident: false };
  }

  // 1ページだけのファイルは分割の必要がなく、ページ番号も確実。
  if (range.start === range.end) {
    return {
      range,
      pages: [{ page: range.start, text: text.trim() }],
      confident: true,
    };
  }

  const lines = text.split("\n");
  const pages: ReferencePage[] = [];
  let currentPage = range.start;
  let buffer: string[] = [];

  for (const line of lines) {
    if (currentPage <= range.end && isPageMarker(line, currentPage)) {
      pages.push({ page: currentPage, text: buffer.join("\n").trim() });
      buffer = [];
      currentPage += 1;
      continue;
    }
    buffer.push(line);
  }

  const expectedCount = range.end - range.start + 1;
  // 最終ページのノンブルまで見つかっていれば、残りは読み取り順の乱れによる
  // 末尾のはみ出しなので最終ページに足す。見つかっていない場合は、残りを
  // そのまま最後のページとして扱う（この場合は分割成功とみなさない）。
  const tail = buffer.join("\n").trim();
  if (pages.length === expectedCount) {
    if (tail) pages[pages.length - 1].text = `${pages[pages.length - 1].text}\n${tail}`.trim();
  } else if (tail) {
    pages.push({ page: currentPage, text: tail });
  }

  const confident =
    pages.length === expectedCount && pages.every((page) => page.text.length > 0);

  return { range, pages, confident };
}

// モデルに渡すテキストを組み立てる。ページ番号を出典として使ってよいかどうかを
// 本文の先頭に明記する。
export function formatPagedDocument(
  fileName: string,
  document: PagedDocument,
  requestedPages?: number[],
): string {
  if (!document.range) {
    return [
      `【${fileName}】`,
      "※このファイルはファイル名からページ範囲を判別できませんでした。出典としてページ番号を書かないでください。",
      "",
      document.pages.map((p) => p.text).join("\n"),
    ].join("\n");
  }

  const { start, end } = document.range;
  const rangeLabel = start === end ? `p.${start}` : `p.${start}-${end}`;

  if (!document.confident) {
    return [
      `【${fileName}（${rangeLabel}）】`,
      `※ページの区切りを特定できませんでした。出典は個別のページ番号ではなく「${rangeLabel}」の範囲で示してください。`,
      "",
      document.pages.map((p) => p.text).join("\n"),
    ].join("\n");
  }

  const selected = requestedPages?.length
    ? document.pages.filter((page) => requestedPages.includes(page.page))
    : document.pages;

  if (selected.length === 0) {
    return `【${fileName}（${rangeLabel}）】\n※指定されたページはこのファイルに含まれていません（このファイルは${rangeLabel}です）。`;
  }

  return [
    `【${fileName}（${rangeLabel}）】`,
    "※各ページ下部のノンブルを手がかりにページを判別しました。出典には下の「--- p.N ---」のページ番号を使ってください。",
    "",
    selected.map((page) => `--- p.${page.page} ---\n${page.text}`).join("\n\n"),
  ].join("\n");
}

// 「29」「29-30」「29,31」のような指定を解釈する。
export function parseRequestedPages(input: string | undefined): number[] {
  if (!input) return [];

  const pages = new Set<number>();
  for (const part of input.split(/[,、\s]+/)) {
    const rangeMatch = part.match(/^(\d{1,3})[-–—〜~ー](\d{1,3})$/);
    if (rangeMatch) {
      const from = Number(rangeMatch[1]);
      const to = Number(rangeMatch[2]);
      if (to >= from && to - from <= 60) {
        for (let page = from; page <= to; page += 1) pages.add(page);
      }
      continue;
    }
    const single = part.match(/^\d{1,3}$/);
    if (single) pages.add(Number(part));
  }

  return [...pages].sort((a, b) => a - b);
}
