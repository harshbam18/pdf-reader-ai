import { useCallback, useState, useEffect } from "react";
import { useSettings } from "./hooks/useSettings";
import { useTTS } from "./hooks/useTTS";
import ReaderHeader from "./components/ReaderHeader";
import Modal from "./components/Modal";
import pdfjsLib from "./pdfWorker";
import type {
  Book,
  Chapter,
  Sentence,
} from "./types/book";
import {
  isChapterHeading,
} from "./utils/chapterDetector";
import {
  Bookmark,
  BookOpenText,
  Highlighter,
  Library,
  MessageSquare,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
} from "lucide-react";
import {
  type BookRecord,
  createBookId,
  deleteBook,
  getAllBookRecords,
  getAnnotations,
  getBook,
  getBookmarks,
  getLatestBookRecord,
  getProgress,
  getSetting,
  saveBook,
  saveAnnotations,
  saveBookmarks,
  saveProgress,
  saveSetting,
} from "./storage/indexedDb";
import "./App.css";

type PDFTextItem = {
  str: string;
};

type PDFTextContent = {
  items: PDFTextItem[];
};

type PDFPage = {
  getTextContent: () => Promise<PDFTextContent>;
};

type PDFDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPage>;
};

const EMPTY_SENTENCES: Sentence[] = [];
type AppView = "library" | "reader";

function App() {
  const [book, setBook] = useState<Book | null>(null);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [libraryBooks, setLibraryBooks] = useState<BookRecord[]>([]);
  const [view, setView] = useState<AppView>("reader");
  const [activeSentence, setActiveSentence] = useState<number | null>(null);
  const [hoveredSentence, setHoveredSentence] = useState<number | null>(null);
  const [highlightedSentences, setHighlightedSentences] = useState<number[]>([]);
  const [sentenceNotes, setSentenceNotes] = useState<Record<number, string>>({});
  const [readingMode, setReadingMode] = useState<"compact" | "comfort" | "book">("comfort");
  const [showToolbar, setShowToolbar] = useState(true);
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: "confirm" | "prompt";
    title: string;
    message: string;
    onConfirm: (value?: string) => void;
    defaultValue?: string;
    placeholder?: string;
    confirmText?: string;
    cancelText?: string;
  }>({
    isOpen: false,
    type: "confirm",
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bookSentences = book?.sentences ?? EMPTY_SENTENCES;
  const sentenceCount = bookSentences.length;
  const currentSentence =
    activeSentence ?? book?.currentSentence ?? 0;
  const currentChapter =
    book?.chapters.find(
      (chapter) =>
        currentSentence >= chapter.startSentence &&
        currentSentence <= chapter.endSentence
    ) ?? book?.chapters[0];
  const isCurrentSentenceBookmarked =
    Boolean(
      book?.bookmarks.includes(currentSentence)
    );
  const bookmarkedSentences =
    book?.bookmarks
      .map((sentenceId) =>
        book.sentences.find((sentence) => sentence.id === sentenceId)
      )
      .filter((sentence): sentence is Sentence => Boolean(sentence)) ?? [];

  const {
    theme,
    setTheme,
    fontSize,
    setFontSize,
    lineSpacing,
    setLineSpacing,
  } = useSettings();

  const {
    isSpeaking,
    speechRate,
    setSpeechRate,
    voices,
    selectedVoice,
    setSelectedVoice,
    play,
    pause,
    stop,
    speakSentence,
  } = useTTS({
    sentences: bookSentences,
    activeSentence,
    setActiveSentence,
  });

  useEffect(() => {
    const modeSettings = {
      compact: {
        fontSize: 1,
        lineSpacing: 1.85,
      },
      comfort: {
        fontSize: 1.18,
        lineSpacing: 2.15,
      },
      book: {
        fontSize: 1.34,
        lineSpacing: 2.45,
      },
    };

    setFontSize(modeSettings[readingMode].fontSize);
    setLineSpacing(modeSettings[readingMode].lineSpacing);
  }, [readingMode, setFontSize, setLineSpacing]);

  const refreshLibrary = useCallback(async () => {
    const records = await getAllBookRecords();
    setLibraryBooks(records);
  }, []);

  const openBook = useCallback(async (
    bookId: string,
    savedBook: Book
  ) => {
    const [
      savedProgress,
      savedBookmarks,
      savedAnnotations,
    ] = await Promise.all([
      getProgress(bookId),
      getBookmarks(bookId),
      getAnnotations(bookId),
    ]);

    const restoredBook = {
      ...savedBook,
      progress:
        savedProgress?.progress ??
        savedBook.progress,
      currentSentence:
        savedProgress?.currentSentence ??
        savedBook.currentSentence,
      bookmarks: savedBookmarks,
    };

    setCurrentBookId(bookId);
    setBook(restoredBook);
    setHighlightedSentences(savedAnnotations.highlights);
    setSentenceNotes(savedAnnotations.notes);
    setActiveSentence(restoredBook.currentSentence);
    setView("reader");
    saveSetting("currentBookId", bookId);
  }, []);

  const handleDeleteBook = useCallback(async (
    bookId: string
  ) => {
    setModalState({
      isOpen: true,
      type: "confirm",
      title: "Delete Book",
      message: "Are you sure you want to delete this book? This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        try {
          await deleteBook(bookId);

          if (currentBookId === bookId) {
            setCurrentBookId(null);
            setBook(null);
            setActiveSentence(null);
            setView("library");
            await saveSetting("currentBookId", null);
          }

          await refreshLibrary();
        } catch {
          setError("Failed to delete the book.");
        }

        setModalState((prev) => ({ ...prev, isOpen: false }));
      },
    });
  }, [currentBookId, refreshLibrary]);

  useEffect(() => {
    let mounted = true;

    const restoreBook = async () => {
      setLoading(true);

      try {
        const savedBookId = await getSetting<string | null>(
          "currentBookId",
          null
        );
        const savedBook =
          savedBookId
            ? await getBook(savedBookId)
            : null;
        const latestRecord =
          savedBook ? null : await getLatestBookRecord();
        const record =
          savedBookId && savedBook
            ? {
                id: savedBookId,
                book: savedBook,
              }
            : latestRecord;

        if (!record || !mounted) return;

        await refreshLibrary();

        if (!mounted) return;

        await openBook(record.id, record.book);
      } catch {
        setError("Unable to restore your saved book.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    restoreBook();

    return () => {
      mounted = false;
    };
  }, [openBook, refreshLibrary]);

  useEffect(() => {
    if (!book || !currentBookId) return;

    const persistBook = async () => {
      await Promise.all([
        saveBook(currentBookId, book),
        saveProgress(
          currentBookId,
          book.progress,
          book.currentSentence
        ),
        saveBookmarks(currentBookId, book.bookmarks),
        saveSetting("currentBookId", currentBookId),
      ]);

      await refreshLibrary();
    };

    persistBook();
  }, [book, currentBookId, refreshLibrary]);

  useEffect(() => {
    if (!currentBookId) return;

    saveAnnotations(currentBookId, {
      highlights: highlightedSentences,
      notes: sentenceNotes,
    });
  }, [currentBookId, highlightedSentences, sentenceNotes]);


  
  /* ===============================
     File Upload
     =============================== */
  const handlePDFUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoading(true);

    try {
      if (file.type === "application/pdf") {
        const buffer = await file.arrayBuffer();
        await loadPDFDocument(buffer, file.name);
      } else if (file.type === "text/plain" || file.name.endsWith(".txt")) {
        const text = await file.text();
        await loadTextDocument(text, file.name);
      } else {
        setError("Unsupported file type. Please upload a PDF or TXT file.");
      }
    } catch {
      setError("Failed to load file. Try another file.");
    }

    setLoading(false);
  };

  /* ===============================
     Load PDF
     =============================== */
  const loadPDFDocument = async (
    data: ArrayBuffer,
    title: string
  ) => {
    const pdf = await pdfjsLib.getDocument({ data }).promise as PDFDocument;
    const bookId = createBookId();

    setCurrentBookId(bookId);
    setBook(null);
    setActiveSentence(null);
    await extractEntireBook(pdf, title);
  };

  /* ===============================
     Load Text File
     =============================== */
  const loadTextDocument = async (
    content: string,
    fileName: string
  ) => {
    const bookId = createBookId();
    const title = fileName.replace(/\.(txt|TXT)$/, "");

    setCurrentBookId(bookId);
    setBook(null);
    setActiveSentence(null);

    const rawLines = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    await processBookContent(rawLines, title);
  };

  /* ===============================
     Extract Text
     =============================== */
  const isTableOfContentsHeading = (text: string): boolean => {
    const cleaned = text.trim().toLowerCase();
    return cleaned === "table of contents" ||
           cleaned === "contents" ||
           cleaned === "toc";
  };

  const isSimpleChapterHeading = (text: string): boolean => {
    return /^(chapter|part)\s+\d+$/i.test(text.trim());
  };

  const isDateLine = (text: string): boolean => {
    const cleaned = text.trim();
    // Check if it looks like a date (not in quotes)
    // Matches patterns like: "28 June 1995", "June 28, 1995", "(Seven days after...)" etc.
    const datePatterns = [
      /^\d{1,2}\s+\w+\s+\d{4}$/,  // 28 June 1995
      /^\w+\s+\d{1,2},?\s+\d{4}$/,  // June 28, 1995
      /^\(\w+.*?\)$/,  // (Seven days after...)
      /^[A-Z][a-z]+day,?\s+\w+\s+\d{1,2},?\s+\d{4}$/,  // Monday, June 28, 1995
    ];

    return datePatterns.some(pattern => pattern.test(cleaned));
  };

  const splitIntoSentences = (text: string): string[] => {
    // Split on sentence boundaries (period/exclamation/question followed by space and capital letter)
    // But preserve abbreviations like "Dr.", "Mr.", etc.
    const sentences: string[] = [];
    let current = "";

    for (let i = 0; i < text.length; i++) {
      current += text[i];

      // Check for sentence end
      if (/[.!?]/.test(text[i])) {
        const nextChar = text[i + 1];
        const nextNextChar = text[i + 2];

        // End of sentence if:
        // - followed by space and capital letter, or
        // - followed by space and quote, or
        // - at end of text
        if (!nextChar ||
            (nextChar === " " && (nextNextChar?.match(/[A-Z"']/))) ||
            nextChar === "\n") {
          current = current.trim();
          if (current) {
            sentences.push(current);
          }
          current = "";
          i++; // skip the space
        }
      }
    }

    if (current.trim()) {
      sentences.push(current.trim());
    }

    return sentences;
  };

  const processBookContent = async (
    rawLines: string[],
    title: string
  ) => {
    setLoading(true);
    setError(null);

    try {
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

      rawLines.forEach((line) => {
        const isTOCHeading = isTableOfContentsHeading(line);
        const isChapterLine = isChapterHeading(line);
        const isSimpleChapter = isSimpleChapterHeading(line);
        const isDate = isDateLine(line);

        // When we find a TOC heading, mark it and create TOC chapter
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

        // While in TOC, only add SIMPLE chapter headings as sentences
        if (inTableOfContents && isSimpleChapter) {
          sentences.push({
            id: sentenceIndex,
            text: line,
            chapterId: currentChapter,
          });
          sentenceIndex++;
          return;
        }

        // Exit TOC when we hit anything that's not a simple chapter heading
        if (inTableOfContents) {
          inTableOfContents = false;
        }

        // Create chapters for chapter headings
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

        // Handle date lines as special scene markers (centered)
        if (isDate) {
          sentences.push({
            id: sentenceIndex,
            text: `[SCENE_MARKER:${line}]`,
            chapterId: currentChapter,
          });
          sentenceIndex++;
          return;
        }

        // Split content into proper sentences
        const sentenceList = splitIntoSentences(line);
        sentenceList.forEach((sentence) => {
          if (sentence.trim()) {
            sentences.push({
              id: sentenceIndex,
              text: sentence,
              chapterId: currentChapter,
            });
            sentenceIndex++;
          }
        });
      });

      // Calculate chapter end sentences
      chapters.forEach((chapter, index) => {
        const nextChapter = chapters[index + 1];
        chapter.endSentence = nextChapter
          ? nextChapter.startSentence - 1
          : sentences.length - 1;
      });

      const newBook: Book = {
        metadata: {
          title,
        },
        chapters,
        sentences,
        progress: 0,
        bookmarks: [],
        currentSentence: 0,
      };

      setBook(newBook);
    } catch {
      setError("Unable to extract text from this file.");
    } finally {
      setLoading(false);
    }
  };

  /* ===============================
     Extract PDF Text
     =============================== */
  const extractEntireBook = async (
    pdf: PDFDocument,
    title: string
  ) => {
    const rawLines: string[] = [];

    try {
      for (
        let pageNum = 1;
        pageNum <= pdf.numPages;
        pageNum++
      ) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();

        let currentLineY: number | null = null;
        let buffer = "";

        (content.items as any[]).forEach((item) => {
          const text = item.str?.trim() || "";
          const itemY = Math.round(item.y);

          // Detect line breaks based on y-coordinate changes
          const isNewLine =
            currentLineY !== null &&
            Math.abs(itemY - currentLineY) > 5;

          if (isNewLine && buffer.trim()) {
            rawLines.push(buffer.trim());
            buffer = "";
          }

          if (!text) return;

          buffer += text + " ";
          currentLineY = itemY;

          // Also break on sentence endings
          if (/[.!?]$/.test(text)) {
            rawLines.push(buffer.trim());
            buffer = "";
            currentLineY = null;
          }
        });

        if (buffer.trim()) {
          rawLines.push(buffer.trim());
        }
      }

      await processBookContent(rawLines, title);
    } catch {
      setError("Unable to extract text from this PDF.");
      setLoading(false);
    }
  };

  /* ===============================
     Navigation
     =============================== */
  const navigateSentence = useCallback((newIndex: number) => {
    if (newIndex < 0 || newIndex >= sentenceCount) return;

    setActiveSentence(newIndex);

    if (isSpeaking) {
      stop();

      setTimeout(() => {
        speakSentence(newIndex);
      }, 50);
    }
  }, [isSpeaking, sentenceCount, speakSentence, stop]);

  const toggleBookmark = () => {
    if (!book || sentenceCount === 0) return;

    toggleSentenceBookmark(
      activeSentence ?? book.currentSentence
    );
  };

  const toggleSentenceBookmark = (sentenceId: number) => {
    if (!book || sentenceCount === 0) return;

    setBook((prev) => {
      if (!prev) return null;

      const hasBookmark =
        prev.bookmarks.includes(sentenceId);

      return {
        ...prev,
        bookmarks: hasBookmark
          ? prev.bookmarks.filter((id) => id !== sentenceId)
          : [...prev.bookmarks, sentenceId].sort((a, b) => a - b),
      };
    });
  };

  const toggleHighlight = (sentenceId: number) => {
    setHighlightedSentences((prev) =>
      prev.includes(sentenceId)
        ? prev.filter((id) => id !== sentenceId)
        : [...prev, sentenceId].sort((a, b) => a - b)
    );
  };

  const editNote = (sentenceId: number) => {
    const existingNote = sentenceNotes[sentenceId] ?? "";

    setModalState({
      isOpen: true,
      type: "prompt",
      title: "Edit Note",
      message: "Add or edit a note for this sentence:",
      placeholder: "Type your note here...",
      defaultValue: existingNote,
      confirmText: "Save",
      cancelText: "Cancel",
      onConfirm: (note) => {
        setSentenceNotes((prev) => {
          const next = { ...prev };

          if (note?.trim()) {
            next[sentenceId] = note.trim();
          } else {
            delete next[sentenceId];
          }

          return next;
        });

        setModalState((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const goToSentence = (sentenceId: number) => {
    setActiveSentence(sentenceId);

    const el = document.getElementById(`sentence-${sentenceId}`);
    el?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };


useEffect(() => {
  setBook((prev) => {
    if (!prev) return null;

    const progress =
      prev.sentences.length > 0
        ? Math.round(
            ((activeSentence ?? 0) /
              prev.sentences.length) *
              100
          ) || 0
        : 0;

    const currentSentence =
      activeSentence || 0;

    if (
      prev.progress === progress &&
      prev.currentSentence === currentSentence
    ) {
      return prev;
    }

    return {
      ...prev,
      progress,
      currentSentence,
    };
  });

  if (activeSentence === null) return;

  const el = document.getElementById(`sentence-${activeSentence}`);
  el?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
}, [activeSentence]);

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;

    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT"
    ) {
      return;
    }

    if (e.code === "Space") {
      e.preventDefault();

      if (isSpeaking) {
        pause();
      } else {
        play();
      }
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();

      const next =
        activeSentence === null
          ? 0
          : Math.min(activeSentence + 1, sentenceCount - 1);

      navigateSentence(next);
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();

      const prev =
        activeSentence === null
          ? 0
          : Math.max(activeSentence - 1, 0);

      navigateSentence(prev);
    }

    if (e.key === "]") {
      setSpeechRate((prev) => Math.min(prev + 0.1, 2));
    }

    if (e.key === "[") {
      setSpeechRate((prev) => Math.max(prev - 0.1, 0.5));
    }
  };

  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, [activeSentence, isSpeaking, navigateSentence, pause, play, sentenceCount, setSpeechRate]);

useEffect(() => {
  let lastScrollY = window.scrollY;

  const handleScroll = () => {
    if (window.scrollY > lastScrollY) {
      setShowToolbar(false);
    } else {
      setShowToolbar(true);
    }

    lastScrollY = window.scrollY;
  };

  window.addEventListener("scroll", handleScroll);

  return () =>
    window.removeEventListener("scroll", handleScroll);
}, []);






return (
  <div className="app-shell">

    {/* SIDEBAR */}
    <aside className="sidebar">

      <div className="sidebar-top">

        <button
          className={
            view === "reader"
              ? "sidebar-icon active-sidebar"
              : "sidebar-icon"
          }
          title="Reader"
          onClick={() => setView("reader")}
        >
          <BookOpenText size={22} />
        </button>

        <button
          className={
            view === "library"
              ? "sidebar-icon active-sidebar"
              : "sidebar-icon"
          }
          title="Library"
          onClick={() => setView("library")}
        >
          <Library size={21} />
        </button>

      </div>

      {book && (
        <div className="sidebar-book">
          <p className="sidebar-kicker">Library</p>
          <h1>{book.metadata.title}</h1>
          <div className="sidebar-progress-track">
            <div
              className="sidebar-progress-fill"
              style={{
                width: `${book.progress}%`,
              }}
            />
          </div>
          <p className="sidebar-meta">
            {book.progress}% read
          </p>
        </div>
      )}

      <div className="chapter-list">

        {view === "reader" && book?.chapters.map((chapter) => (
          <button
            key={chapter.id}
            className={
              chapter.id === currentChapter?.id
                ? "chapter-item active-chapter"
                : "chapter-item"
            }
            onClick={() => {
              setActiveSentence(chapter.startSentence);

              const el =
                document.getElementById(
                  `sentence-${chapter.startSentence}`
                );

              el?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
          >
            {chapter.title}
          </button>
        ))}

      </div>

      {bookmarkedSentences.length > 0 && (
        <div className="bookmark-list">
          <p className="sidebar-kicker">Bookmarks</p>
          {bookmarkedSentences.slice(0, 6).map((sentence) => (
            <button
              key={sentence.id}
              className="bookmark-item"
              onClick={() => goToSentence(sentence.id)}
            >
              <Bookmark size={14} />
              <span>{sentence.text}</span>
            </button>
          ))}
        </div>
      )}

    </aside>

    {/* MAIN */}
    <main className="main-layout">

      <div
        className={
          showToolbar
            ? "toolbar-visible"
            : "toolbar-hidden"
        }
      >
        <ReaderHeader
          readingProgress={book?.progress ?? 0}
          bookTitle={book?.metadata.title ?? "Reader"}
          currentChapterTitle={currentChapter?.title}
          handlePDFUpload={handlePDFUpload}
          theme={theme}
          setTheme={setTheme}
          readingMode={readingMode}
          setReadingMode={setReadingMode}
          fontSize={fontSize}
          lineSpacing={lineSpacing}
          setFontSize={setFontSize}
          setLineSpacing={setLineSpacing}
        />
      </div>

      {loading && (
        <div className="status-card">
          Loading book...
        </div>
      )}

      {error && (
        <div className="error-card">
          {error}
        </div>
      )}

      {view === "library" && (
        <section className="library-panel">
          <div className="library-header">
            <div>
              <p className="sidebar-kicker">Personal Library</p>
              <h1>Books</h1>
            </div>
          </div>

          {libraryBooks.length === 0 && !loading && (
            <div className="empty-reader compact-empty">
              <div className="empty-reader-icon">
                <Library size={42} />
              </div>
              <h1>Your library is empty</h1>
              <label className="empty-upload">
                Upload File
                <input
                  type="file"
                  accept="application/pdf,.txt,text/plain"
                  onChange={handlePDFUpload}
                />
              </label>
            </div>
          )}

          <div className="library-grid">
            {libraryBooks.map((record) => (
              <article
                key={record.id}
                className={
                  record.id === currentBookId
                    ? "library-card active-library-card"
                    : "library-card"
                }
              >
                <button
                  className="book-cover"
                  onClick={() => openBook(record.id, record.book)}
                >
                  <BookOpenText size={34} />
                </button>
                <div className="library-card-body">
                  <h2>{record.book.metadata.title}</h2>
                  <p>
                    {record.book.progress}% read · {record.book.bookmarks.length} bookmarks
                  </p>
                  <div className="sidebar-progress-track">
                    <div
                      className="sidebar-progress-fill"
                      style={{
                        width: `${record.book.progress}%`,
                      }}
                    />
                  </div>
                  <p className="library-date">
                    Last opened {new Date(record.updatedAt).toLocaleDateString()}
                  </p>
                  <div className="library-card-actions">
                    <button
                      className="resume-button"
                      onClick={() => openBook(record.id, record.book)}
                    >
                      Resume reading
                    </button>
                    <button
                      className="delete-button"
                      title="Delete book"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBook(record.id);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {view === "reader" && (
      <section className="reader-panel">
        {!book && !loading && (
          <div className="empty-reader">
            <div className="empty-reader-icon">
              <BookOpenText size={42} />
            </div>
            <h1>Open a book</h1>
            <p className="empty-reader-subtitle">Use the upload button in the toolbar to add a book</p>
          </div>
        )}

        <div
          className={`reader ${readingMode} ${
            isSpeaking ? "reader-speaking" : ""
          }`}
          style={{
            fontSize: `${fontSize}rem`,
            lineHeight: lineSpacing,
          }}
        >
          {book?.sentences.map((s) => {
            const chapter =
              book.chapters.find(
                (c) =>
                  c.startSentence === s.id
              );

            const isSceneMarker = s.text.startsWith("[SCENE_MARKER:");
            const sceneDate = isSceneMarker
              ? s.text.replace("[SCENE_MARKER:", "").replace("]", "")
              : null;

            return (
              <div key={s.id}>

                {chapter && (
                  <h2 className="chapter-heading">
                    {chapter.title}
                  </h2>
                )}

                {isSceneMarker ? (
                  <div
                    id={`sentence-${s.id}`}
                    className="scene-marker"
                  >
                    {sceneDate}
                  </div>
                ) : (
                  <span
                    id={`sentence-${s.id}`}
                    className={[
                      activeSentence === s.id
                        ? "active-sentence"
                        : "",
                      highlightedSentences.includes(s.id)
                        ? "highlighted-sentence"
                        : "",
                      book.bookmarks.includes(s.id)
                        ? "bookmarked-sentence"
                        : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() =>
                      navigateSentence(s.id)
                    }
                    onMouseEnter={() =>
                      setHoveredSentence(s.id)
                    }
                    onMouseLeave={() =>
                      setHoveredSentence(null)
                    }
                  >
                    {s.text}{" "}
                    {(hoveredSentence === s.id ||
                      book.bookmarks.includes(s.id) ||
                      highlightedSentences.includes(s.id) ||
                      sentenceNotes[s.id]) && (
                      <span className="sentence-tools">
                      <button
                        title="Bookmark sentence"
                        className={
                          book.bookmarks.includes(s.id)
                            ? "tool-active"
                            : ""
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleSentenceBookmark(s.id);
                        }}
                      >
                        <Bookmark size={14} />
                      </button>
                      <button
                        title="Highlight sentence"
                        className={
                          highlightedSentences.includes(s.id)
                            ? "tool-active"
                            : ""
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleHighlight(s.id);
                        }}
                      >
                        <Highlighter size={14} />
                      </button>
                      <button
                        title="Add note"
                        className={
                          sentenceNotes[s.id]
                            ? "tool-active"
                            : ""
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          editNote(s.id);
                        }}
                      >
                        <MessageSquare size={14} />
                      </button>
                    </span>
                  )}
                </span>
                )}

                {!isSceneMarker && sentenceNotes[s.id] && (
                  <button
                    className="sentence-note"
                    onClick={() => editNote(s.id)}
                  >
                    <MessageSquare size={14} />
                    {sentenceNotes[s.id]}
                  </button>
                )}

              </div>
            );
          })}
        </div>

        {book && (
          <div className="mini-player">
          <div className="voice-indicator">
            <Volume2 size={18} />
            <span>
              {isSpeaking ? "Narrating" : "Paused"}
            </span>
          </div>
          <div className="mini-player-controls">
            <button
              title="Previous sentence"
              onClick={() =>
                navigateSentence(Math.max(currentSentence - 1, 0))
              }
            >
              <SkipBack size={18} />
            </button>
            <button
              className="primary-player-button"
              title={isSpeaking ? "Pause narration" : "Start narration"}
              onClick={isSpeaking ? pause : play}
            >
              {isSpeaking ? <Pause size={19} /> : <Play size={19} />}
            </button>
            <button
              title="Next sentence"
              onClick={() =>
                navigateSentence(
                  Math.min(currentSentence + 1, sentenceCount - 1)
                )
              }
            >
              <SkipForward size={18} />
            </button>
            <button
              className={
                isCurrentSentenceBookmarked
                  ? "bookmark-button bookmark-active"
                  : "bookmark-button"
              }
              title="Bookmark sentence"
              onClick={toggleBookmark}
            >
              <Bookmark size={18} />
            </button>
          </div>
          <div className="speed-control">
            <span>{speechRate.toFixed(1)}x</span>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={speechRate}
              onChange={(e) =>
                setSpeechRate(Number(e.target.value))
              }
            />
          </div>
          <select
            className="voice-select"
            value={selectedVoice?.name || ""}
            onChange={(e) =>
              setSelectedVoice(
                voices.find(
                  (v) => v.name === e.target.value
                ) || null
              )
            }
          >
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
          </div>
        )}
      </section>
      )}

    </main>

    <Modal
      isOpen={modalState.isOpen}
      type={modalState.type}
      title={modalState.title}
      message={modalState.message}
      placeholder={modalState.placeholder}
      defaultValue={modalState.defaultValue}
      confirmText={modalState.confirmText}
      cancelText={modalState.cancelText}
      onConfirm={(value) => {
        modalState.onConfirm(value);
      }}
      onCancel={() => {
        setModalState((prev) => ({ ...prev, isOpen: false }));
      }}
    />
  </div>
);
}

export default App;
