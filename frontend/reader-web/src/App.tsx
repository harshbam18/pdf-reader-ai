import { useState, useEffect } from "react";
import { useSettings } from "./hooks/useSettings";
import { useTTS } from "./hooks/useTTS";
import ReaderHeader from "./components/ReaderHeader";
import pdfjsLib from "./pdfWorker";
import "./App.css";

type Sentence = {
  id: number;
  text: string;
};


function App() {
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [activeSentence, setActiveSentence] = useState<number | null>(null);
  const [readingProgress, setReadingProgress] = useState(0);
  const [hoveredSentence, setHoveredSentence] = useState<number | null>(null);
  const [readingMode, setReadingMode] = useState<"compact" | "comfort" | "book">("comfort");
  const [showToolbar, setShowToolbar] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    sentences,
    activeSentence,
    setActiveSentence,
  });


  
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
      await loadPDFDocument(buffer);
    } catch {
      setError("Failed to load PDF. Try another file.");
    }

    setLoading(false);
  };

  /* ===============================
     Load PDF
     =============================== */
  const loadPDFDocument = async (data: ArrayBuffer) => {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    setSentences([]);
    setActiveSentence(null);
    setReadingProgress(0);
    await extractEntireBook(pdf);
  };

  /* ===============================
     Extract Text
     =============================== */
  const extractEntireBook = async (pdf: any) => {
    setLoading(true);
    setError(null);

    try {
      const allLines: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        let buffer = "";

        content.items.forEach((item: any) => {
          const text = item.str.trim();

          if (!text) return;

          buffer += text + " ";

          if (/[.!?]$/.test(text)) {
            allLines.push(buffer.trim());
            buffer = "";
          }
        });

        if (buffer.trim()) {
          allLines.push(buffer.trim());
        }
      }

      const parsed = allLines
        .map((text, index) => ({
          id: index,
          text,
        }))
        .filter((s) => s.text.length > 0);

      setSentences(parsed);
    } catch {
      setError("Unable to extract text from this book.");
    } finally {
      setLoading(false);
    }
};

  /* ===============================
     Navigation
     =============================== */
  const navigateSentence = (newIndex: number) => {
    if (newIndex < 0 || newIndex >= sentences.length) return;

    setActiveSentence(newIndex);

    if (isSpeaking) {
      stop();

      setTimeout(() => {
        speakSentence(newIndex);
      }, 50);
    }
  };


useEffect(() => {
  const progress =
    activeSentence !== null && sentences.length > 0
      ? Math.round((activeSentence / sentences.length) * 100)
      : 0;

  setReadingProgress(progress);

  if (activeSentence === null) return;

  const el = document.getElementById(`sentence-${activeSentence}`);
  el?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
}, [activeSentence, sentences.length]);

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
          : Math.min(activeSentence + 1, sentences.length - 1);

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
}, [isSpeaking, activeSentence, sentences.length]);

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

      <div className="sidebar-icon active-sidebar">
        📘
      </div>

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
          readingProgress={readingProgress}
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

      {/* READER */}
      <section className="reader-panel">
        <div
          className={`reader ${readingMode} ${
            isSpeaking ? "reader-speaking" : ""
          }`}
          style={{
            fontSize: `${fontSize}rem`,
            lineHeight: lineSpacing,
          }}
        >
          {sentences.map((s) => (
            <span
              key={s.id}
              id={`sentence-${s.id}`}
              className={
                activeSentence === s.id
                  ? "active-sentence"
                  : ""
              }
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
              {hoveredSentence === s.id && (
                <span className="sentence-actions">
                  <button>🔖</button>
                  <button>↺</button>
                  <button>✨</button>
                </span>
              )}
            </span>
          ))}
        </div>

        <div className="mini-player">
          <div className="voice-indicator">
            <div className="voice-pulse" />
            <span>
              {isSpeaking ? "Narrating" : "Paused"}
            </span>
          </div>
          <button onClick={play}>▶</button>
          <button onClick={pause}>⏸</button>
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
          <select
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
      </section>

    </main>
  </div>
);
}

export default App;
