export type ContentBlockType =
  | "text"
  | "scene-marker"
  | "image";

export type Sentence = {
  id: number;
  text?: string;
  chapterId: number;
  type: ContentBlockType;
  imageSrc?: string;
  alt?: string;
};

export type Chapter = {
  id: number;
  title: string;

  startSentence: number;
  endSentence: number;
};

export type BookMetadata = {
  title: string;
  author?: string;
  sourceType: "pdf" | "txt";
  coverImage?: string;
};

export type Book = {
  metadata: BookMetadata;

  chapters: Chapter[];

  sentences: Sentence[];

  progress: number;

  bookmarks: number[];

  currentSentence: number;
};
