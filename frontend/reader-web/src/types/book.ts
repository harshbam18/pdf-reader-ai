export type Sentence = {
  id: number;
  text: string;
  chapterId: number;
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
};

export type Book = {
  metadata: BookMetadata;

  chapters: Chapter[];

  sentences: Sentence[];

  progress: number;

  bookmarks: number[];

  currentSentence: number;
};
