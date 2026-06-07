export type AnnotationType =
  | "bookmark"
  | "highlight"
  | "note";

export type Annotation = {
  id: string;
  bookId: string;
  type: AnnotationType;
  startSentence: number;
  endSentence: number;
  note?: string;
  createdAt: number;
  updatedAt: number;
};
