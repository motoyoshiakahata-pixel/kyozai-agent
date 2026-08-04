// 問題作成エージェントが参照するGoogleドライブのフォルダ定義。
//
// 単一の教員のみが使う想定のため、フォルダIDは設定ファイルではなくここに直接
// 定義している。フォルダを移動・作り直した場合は、Googleドライブでフォルダを
// 開いたときのURL（.../folders/【この部分】）をidに貼り替えること。
//
// このモジュールはサーバー側（プロンプト生成・Drive API）とクライアント側
// （参照フォルダの表示）の両方から読み込むため、server-onlyにはしない。

export type DriveFolderKey = "textbook" | "reference_book" | "past_exam" | "question_model";

export interface ReferenceFolder {
  key: DriveFolderKey;
  /** Googleドライブ上の実際のフォルダ名 */
  name: string;
  /** Googleドライブ上のフォルダID */
  id: string;
  /** 画面・プロンプトでの説明 */
  description: string;
  /** 出題の根拠として必須の資料か（欠けていると教材を作成できない） */
  required: boolean;
}

// いずれも「マイドライブ ＞ 2026【R8一宮】 ＞ R8公共」配下のフォルダ。
export const REFERENCE_FOLDERS: ReferenceFolder[] = [
  {
    key: "textbook",
    name: "04_教科書PDF",
    id: "1hxHQfu2ODoeUXmCpdKaFKUmpmmPFaHy4",
    description: "「公共」教科書PDF（章・テーマごと、ページ範囲がファイル名に入っている）",
    required: true,
  },
  {
    key: "reference_book",
    name: "06_資料集PDF",
    id: "1TBa4llcnwtRto9uh406h2AcDRBQMbMdA",
    description: "資料集PDF（統計・グラフ・判例などの資料。ページ範囲がファイル名に入っている）",
    required: true,
  },
  {
    key: "past_exam",
    name: "03_共通テスト関連",
    id: "1So7Z_8pp5r28201pjC2cQWr_jzsqWjwo",
    description: "実際の大学入試共通テストの問題冊子（出題形式の参考）",
    required: false,
  },
  {
    key: "question_model",
    name: "12_問題モデルフォルダ",
    id: "1ernaHhAumZbioz7TVYbtLRZJaCQpGd-z",
    description: "過去に作成した問題・解答解説のモデル（文体・形式・難易度の基準）",
    required: true,
  },
];

export type DriveFolderAccessStatus = "ok" | "empty" | "not_found" | "forbidden" | "error";

/** 参照フォルダ1件の疎通確認結果（サーバーで作成し、画面にそのまま渡す） */
export interface DriveFolderAccessResult extends ReferenceFolder {
  /** Googleドライブ上の実際のフォルダ名（取得できた場合） */
  actualName: string | null;
  status: DriveFolderAccessStatus;
  fileCount: number;
  sampleFileNames: string[];
  message: string | null;
}

export function getReferenceFolder(key: DriveFolderKey): ReferenceFolder {
  const folder = REFERENCE_FOLDERS.find((f) => f.key === key);
  if (!folder) throw new Error(`未定義の参照フォルダです: ${key}`);
  return folder;
}

export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
