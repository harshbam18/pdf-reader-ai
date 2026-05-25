import { useCallback, useState, useEffect } from "react";
import { useSettings } from "./hooks/useSettings";
import { useTTS } from "./hooks/useTTS";
import ReaderHeader from "./components/ReaderHeader";
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
  Volume2,
} from "lucide-react";
import {
  type BookRecord,
  createBookId,
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
     PDF Upload
     =============================== */
  const handlePDFUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoading(true);

    try {
      const buffer = await file.arrayBuffer();
      await loadPDFDocument(buffer, file.name);
    } catch {
      setError("Failed to load PDF. Try another file.");
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
     Extract Text
     =============================== */
  const extractEntireBook = async (
    pdf: PDFDocument,
    title: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      const rawLines: string[] = [];

      for (
        let pageNum = 1;
        pageNum <= pdf.numPages;
        pageNum++
      ) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();

        let buffer = "";

        content.items.forEach((item) => {
          const text = item.str.trim();

          if (!text) return;

          buffer += text + " ";

          if (/[.!?]$/.test(text)) {
            rawLines.push(buffer.trim());
            buffer = "";
          }
        });

        if (buffer.trim()) {
          rawLines.push(buffer.trim());
        }
      }

      const chapters: Chapter[] = [];
      const sentences: Sentence[] = [];

      let currentChapter = 0;
      let sentenceIndex = 0;

      chapters.push({
        id: 0,
        title: "Introduction",
        startSentence: 0,
        endSentence: 0,
      });

      rawLines.forEach((line) => {
        if (isChapterHeading(line)) {
          currentChapter++;

          chapters.push({
            id: currentChapter,
            title: line,
            startSentence: sentenceIndex,
            endSentence: sentenceIndex,
          });

          return;
        }

        sentences.push({
          id: sentenceIndex,
          text: line,
          chapterId: currentChapter,
        });

        sentenceIndex++;
      });

      chapters.forEach((chapter, index) => {
        const nextChapter =
          chapters[index + 1];

        chapter.endSentence =
          nextChapter
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
      setError("Unable to extract text from this book.");
    } finally {
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
    const existingNote =
      sentenceNotes[sentenceId] ?? "";
    const note = window.prompt(
      "Add a note for this sentence",
      existingNote
    );

    if (note === null) return;

    setSentenceNotes((prev) => {
      const next = {
        ...prev,
      };

      if (note.trim()) {
        next[sentenceId] = note.trim();
      } else {
        delete next[sentenceId];
      }

      return next;
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

        {book?.chapters.map((chapter) => (
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
            <label className="empty-upload">
              Upload PDF
              <input
                type="file"
                accept="application/pdf"
                onChange={handlePDFUpload}
              />
            </label>
          </div>

          {libraryBooks.length === 0 && !loading && (
            <div className="empty-reader compact-empty">
              <div className="empty-reader-icon">
                <Library size={42} />
              </div>
              <h1>Your library is empty</h1>
              <label className="empty-upload">
                Upload PDF
                <input
                  type="file"
                  accept="application/pdf"
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
                  <button
                    className="resume-button"
                    onClick={() => openBook(record.id, record.book)}
                  >
                    Resume reading
                  </button>
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
            <label className="empty-upload">
              Upload PDF
              <input
                type="file"
                accept="application/pdf"
                onChange={handlePDFUpload}
              />
            </label>
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

            return (
              <div key={s.id}>

                {chapter && (
                  <h2 className="chapter-heading">
                    {chapter.title}
                  </h2>
                )}

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

                {sentenceNotes[s.id] && (
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
  </div>
);
}

export default App;
