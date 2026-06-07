import type { Book } from "../types/book";

const DB_NAME = "reader-ai";
const DB_VERSION = 2;

export type ReaderTheme = "light" | "dark" | "sepia";

export type ReaderSettings = {
  theme: ReaderTheme;
  fontSize: number;
  lineSpacing: number;
  selectedVoiceName: string | null;
  speechRate: number;
};

export type BookRecord = {
  id: string;
  book: Book;
  createdAt: number;
  updatedAt: number;
};

type SettingRecord = {
  key: string;
  value: unknown;
};

type BookmarkRecord = {
  bookId: string;
  sentenceIds: number[];
  updatedAt: number;
};

type ProgressRecord = {
  bookId: string;
  progress: number;
  currentSentence: number;
  updatedAt: number;
};

type SummaryRecord = {
  bookId: string;
  summaries: unknown[];
  updatedAt: number;
};

export type AnnotationRecord = {
  bookId: string;
  highlights: number[];
  notes: Record<number, string>;
  updatedAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

const requestToPromise = <T>(
  request: IDBRequest<T>
) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const openDatabase = () => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("books")) {
        db.createObjectStore("books", {
          keyPath: "id",
        });
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", {
          keyPath: "key",
        });
      }

      if (!db.objectStoreNames.contains("bookmarks")) {
        db.createObjectStore("bookmarks", {
          keyPath: "bookId",
        });
      }

      if (!db.objectStoreNames.contains("progress")) {
        db.createObjectStore("progress", {
          keyPath: "bookId",
        });
      }

      if (!db.objectStoreNames.contains("summaries")) {
        db.createObjectStore("summaries", {
          keyPath: "bookId",
        });
      }

      if (!db.objectStoreNames.contains("annotations")) {
        db.createObjectStore("annotations", {
          keyPath: "bookId",
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
};

const getStore = async (
  storeName: string,
  mode: IDBTransactionMode
) => {
  const db = await openDatabase();
  return db
    .transaction(storeName, mode)
    .objectStore(storeName);
};

export const createBookId = () =>
  crypto.randomUUID();

export const saveBook = async (
  id: string,
  book: Book
) => {
  const store = await getStore("books", "readwrite");
  const existing = await requestToPromise<BookRecord | undefined>(
    store.get(id)
  );
  const now = Date.now();

  await requestToPromise(
    store.put({
      id,
      book,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies BookRecord)
  );
};

export const getBook = async (
  id: string
) => {
  const store = await getStore("books", "readonly");
  const record = await requestToPromise<BookRecord | undefined>(
    store.get(id)
  );

  return record?.book ?? null;
};

export const deleteBook = async (
  id: string
) => {
  const stores = ["books", "bookmarks", "progress", "summaries", "annotations"];

  for (const storeName of stores) {
    const store = await getStore(storeName, "readwrite");
    await requestToPromise(store.delete(id));
  }
};

export const getLatestBookRecord = async () => {
  const store = await getStore("books", "readonly");
  const records = await requestToPromise<BookRecord[]>(
    store.getAll()
  );

  return records.sort(
    (a, b) => b.updatedAt - a.updatedAt
  )[0] ?? null;
};

export const getAllBookRecords = async () => {
  const store = await getStore("books", "readonly");
  const records = await requestToPromise<BookRecord[]>(
    store.getAll()
  );

  return records.sort(
    (a, b) => b.updatedAt - a.updatedAt
  );
};

export const saveSetting = async <T>(
  key: string,
  value: T
) => {
  const store = await getStore("settings", "readwrite");

  await requestToPromise(
    store.put({
      key,
      value,
    } satisfies SettingRecord)
  );
};

export const getSetting = async <T>(
  key: string,
  fallback: T
) => {
  const store = await getStore("settings", "readonly");
  const record = await requestToPromise<SettingRecord | undefined>(
    store.get(key)
  );

  return (record?.value as T | undefined) ?? fallback;
};

export const saveBookmarks = async (
  bookId: string,
  sentenceIds: number[]
) => {
  const store = await getStore("bookmarks", "readwrite");

  await requestToPromise(
    store.put({
      bookId,
      sentenceIds,
      updatedAt: Date.now(),
    } satisfies BookmarkRecord)
  );
};

export const getBookmarks = async (
  bookId: string
) => {
  const store = await getStore("bookmarks", "readonly");
  const record = await requestToPromise<BookmarkRecord | undefined>(
    store.get(bookId)
  );

  return record?.sentenceIds ?? [];
};

export const saveProgress = async (
  bookId: string,
  progress: number,
  currentSentence: number
) => {
  const store = await getStore("progress", "readwrite");

  await requestToPromise(
    store.put({
      bookId,
      progress,
      currentSentence,
      updatedAt: Date.now(),
    } satisfies ProgressRecord)
  );
};

export const getProgress = async (
  bookId: string
) => {
  const store = await getStore("progress", "readonly");
  const record = await requestToPromise<ProgressRecord | undefined>(
    store.get(bookId)
  );

  return record ?? null;
};

export const saveSummaries = async (
  bookId: string,
  summaries: unknown[]
) => {
  const store = await getStore("summaries", "readwrite");

  await requestToPromise(
    store.put({
      bookId,
      summaries,
      updatedAt: Date.now(),
    } satisfies SummaryRecord)
  );
};

export const getSummaries = async (
  bookId: string
) => {
  const store = await getStore("summaries", "readonly");
  const record = await requestToPromise<SummaryRecord | undefined>(
    store.get(bookId)
  );

  return record?.summaries ?? [];
};

export const saveAnnotations = async (
  bookId: string,
  annotations: Pick<AnnotationRecord, "highlights" | "notes">
) => {
  const store = await getStore("annotations", "readwrite");

  await requestToPromise(
    store.put({
      bookId,
      highlights: annotations.highlights,
      notes: annotations.notes,
      updatedAt: Date.now(),
    } satisfies AnnotationRecord)
  );
};

export const getAnnotations = async (
  bookId: string
) => {
  const store = await getStore("annotations", "readonly");
  const record = await requestToPromise<AnnotationRecord | undefined>(
    store.get(bookId)
  );

  return {
    highlights: record?.highlights ?? [],
    notes: record?.notes ?? {},
  };
};
