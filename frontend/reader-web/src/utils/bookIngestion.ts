import type {
  Book,
  Chapter,
  Sentence,
} from "../types/book";
import {
  isChapterHeading,
} from "./chapterDetector";

export type PDFTextItem = {
  str?: string;
  transform?: number[];
  y?: number;
};

export type PDFImageObject = {
  width?: number;
  height?: number;
  data?: Uint8ClampedArray | Uint8Array;
};

export type PDFPage = {
  getTextContent: () => Promise<{
    items: PDFTextItem[];
  }>;
  getOperatorList: () => Promise<{
    fnArray: number[];
    argsArray: unknown[][];
  }>;
  objs: {
    get: (
      name: string,
      callback: (image: PDFImageObject) => void
    ) => void;
  };
};

export type PDFDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPage>;
};

type RawBlock =
  | {
      type: "line";
      text: string;
    }
  | {
      type: "image";
      imageSrc: string;
      alt: string;
    };

const imageObjectCode = 85;

export const isTableOfContentsHeading = (text: string) => {
  const cleaned = text.trim().toLowerCase();

  return cleaned === "table of contents" ||
    cleaned === "contents" ||
    cleaned === "toc";
};

export const isSimpleChapterHeading = (text: string) =>
  /^(chapter|part)\s+\d+$/i.test(text.trim());

export const isDateLine = (text: string) => {
  const cleaned = text.trim();
  const datePatterns = [
    /^\d{1,2}\s+\w+\s+\d{4}$/,
    /^\w+\s+\d{1,2},?\s+\d{4}$/,
    /^\(\w+.*?\)$/,
    /^[A-Z][a-z]+day,?\s+\w+\s+\d{1,2},?\s+\d{4}$/,
  ];

  return datePatterns.some((pattern) => pattern.test(cleaned));
};

export const splitIntoSentences = (text: string) => {
  const sentences: string[] = [];
  let current = "";

  for (let i = 0; i < text.length; i++) {
    current += text[i];

    if (/[.!?]/.test(text[i])) {
      const nextChar = text[i + 1];
      const nextNextChar = text[i + 2];

      if (
        !nextChar ||
        (nextChar === " " && nextNextChar?.match(/[A-Z"']/)) ||
        nextChar === "\n"
      ) {
        current = current.trim();

        if (current) {
          sentences.push(current);
        }

        current = "";
        i++;
      }
    }
  }

  if (current.trim()) {
    sentences.push(current.trim());
  }

  return sentences;
};

const imageToDataUrl = (
  image: PDFImageObject
) => {
  if (!image.width || !image.height || !image.data) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const imageData = new ImageData(
    new Uint8ClampedArray(image.data),
    image.width,
    image.height
  );
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL("image/png");
};

const getPageImages = async (
  page: PDFPage,
  pageNum: number
) => {
  const operatorList = await page.getOperatorList();
  const imageNames = operatorList.fnArray
    .map((fn, index) =>
      fn === imageObjectCode
        ? operatorList.argsArray[index]?.[0]
        : null
    )
    .filter((name): name is string => typeof name === "string");

  const images = await Promise.all(
    imageNames.map(
      (name, index) =>
        new Promise<RawBlock | null>((resolve) => {
          page.objs.get(name, (image) => {
            const imageSrc = imageToDataUrl(image);

            resolve(
              imageSrc
                ? {
                    type: "image",
                    imageSrc,
                    alt: `PDF image from page ${pageNum}, image ${index + 1}`,
                  }
                : null
            );
          });
        })
    )
  );

  return images.filter((image): image is RawBlock => Boolean(image));
};

export const extractPdfBlocks = async (
  pdf: PDFDocument
) => {
  const rawBlocks: RawBlock[] = [];

  for (
    let pageNum = 1;
    pageNum <= pdf.numPages;
    pageNum++
  ) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    let currentLineY: number | null = null;
    let buffer = "";

    content.items.forEach((item) => {
      const text = item.str?.trim() || "";
      const itemY = Math.round(
        item.y ??
          item.transform?.[5] ??
          0
      );

      const isNewLine =
        currentLineY !== null &&
        Math.abs(itemY - currentLineY) > 5;

      if (isNewLine && buffer.trim()) {
        rawBlocks.push({
          type: "line",
          text: buffer.trim(),
        });
        buffer = "";
      }

      if (!text) return;

      buffer += text + " ";
      currentLineY = itemY;

      if (/[.!?]$/.test(text)) {
        rawBlocks.push({
          type: "line",
          text: buffer.trim(),
        });
        buffer = "";
        currentLineY = null;
      }
    });

    if (buffer.trim()) {
      rawBlocks.push({
        type: "line",
        text: buffer.trim(),
      });
    }

    rawBlocks.push(...await getPageImages(page, pageNum));
  }

  return rawBlocks;
};

export const extractTextBlocks = (
  content: string
) =>
  content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((text) => ({
      type: "line" as const,
      text,
    }));

export const buildBookFromBlocks = (
  rawBlocks: RawBlock[],
  title: string,
  sourceType: "pdf" | "txt"
) => {
  const chapters: Chapter[] = [];
  const sentences: Sentence[] = [];

  let currentChapter = 0;
  let sentenceIndex = 0;
  let inTableOfContents = false;

  chapters.push({
    id: 0,
    title: "Introduction",
    startSentence: 0,
    endSentence: 0,
  });

  rawBlocks.forEach((block) => {
    if (block.type === "image") {
      sentences.push({
        id: sentenceIndex,
        type: "image",
        imageSrc: block.imageSrc,
        alt: block.alt,
        chapterId: currentChapter,
      });
      sentenceIndex++;
      return;
    }

    const line = block.text;
    const isTOCHeading = isTableOfContentsHeading(line);
    const isChapterLine = isChapterHeading(line);
    const isSimpleChapter = isSimpleChapterHeading(line);
    const isDate = isDateLine(line);

    if (isTOCHeading) {
      inTableOfContents = true;
      currentChapter++;
      chapters.push({
        id: currentChapter,
        title: "Table of Contents",
        startSentence: sentenceIndex,
        endSentence: sentenceIndex,
      });
      return;
    }

    if (inTableOfContents && isSimpleChapter) {
      sentences.push({
        id: sentenceIndex,
        type: "text",
        text: line,
        chapterId: currentChapter,
      });
      sentenceIndex++;
      return;
    }

    if (inTableOfContents) {
      inTableOfContents = false;
    }

    if (isChapterLine) {
      currentChapter++;
      chapters.push({
        id: currentChapter,
        title: line,
        startSentence: sentenceIndex,
        endSentence: sentenceIndex,
      });
      return;
    }

    if (isDate) {
      sentences.push({
        id: sentenceIndex,
        type: "scene-marker",
        text: line,
        chapterId: currentChapter,
      });
      sentenceIndex++;
      return;
    }

    splitIntoSentences(line).forEach((sentence) => {
      if (!sentence.trim()) return;

      sentences.push({
        id: sentenceIndex,
        type: "text",
        text: sentence,
        chapterId: currentChapter,
      });
      sentenceIndex++;
    });
  });

  chapters.forEach((chapter, index) => {
    const nextChapter = chapters[index + 1];
    chapter.endSentence = nextChapter
      ? nextChapter.startSentence - 1
      : sentences.length - 1;
  });

  return {
    metadata: {
      title,
      sourceType,
    },
    chapters,
    sentences,
    progress: 0,
    bookmarks: [],
    currentSentence: 0,
  } satisfies Book;
};
