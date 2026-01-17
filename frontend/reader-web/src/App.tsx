import { useState, useEffect } from "react";
import pdfjsLib from "./pdfWorker";
import "./App.css";

type Sentence = {
  id: number;
  text: string;
};


function App() {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [activeSentence, setActiveSentence] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechRate, setSpeechRate] = useState(1);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);


  
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
    setPdfDoc(pdf);
    setTotalPages(pdf.numPages);
    setCurrentPage(1);
    await extractTextFromPage(pdf, 1);
  };

  /* ===============================
     Extract Text
     =============================== */
  const extractTextFromPage = async (pdf: any, pageNumber: number) => {
    setLoading(true);
    setError(null);

    try {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      const lines: string[] = [];
      let buffer = "";

      content.items.forEach((item: any) => {
        const text = item.str.trim();
        if (!text) return;

        buffer += text + " ";

        if (/[.!?]$/.test(text)) {
          lines.push(buffer.trim());
          buffer = "";
        }
      });

      if (buffer.trim()) lines.push(buffer.trim());

      renderReadableText(lines);
    } catch {
      setError("Unable to extract text from this page.");
    }

    setLoading(false);
  };

  const splitIntoSentences = (lines: string[]): Sentence[] => {
  let id = 0;

  return lines
    .flatMap((line) =>
      line.split(/(?<=[.!?])\s+/)
    )
    .map((text) => ({
      id: id++,
      text: text.trim(),
    }))
    .filter((s) => s.text.length > 0);
  };

  /* ===============================
     Render Readable Text
     =============================== */
  const renderReadableText = (lines: string[]) => {
    const sentenceList = splitIntoSentences(lines);
    setSentences(sentenceList);
    setActiveSentence(null);
};

  /* ===============================
     Navigation
     =============================== */
  const goToPage = async (page: number) => {
    if (!pdfDoc || page < 1 || page > totalPages) return;
    setCurrentPage(page);
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    await extractTextFromPage(pdfDoc, page);
  };

  //theme
  const [theme, setTheme] = useState<"light" | "dark" | "sepia">(() => {
  return (localStorage.getItem("theme") as "light" | "dark" | "sepia") || "light";
  });
  //voice
  const speakSentence = (index: number) => {
    if (!sentences[index]) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(sentences[index].text);

    utterance.rate = speechRate;
    if (selectedVoice) utterance.voice = selectedVoice;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setActiveSentence(index);
    };

    utterance.onend = () => {
      const next = index + 1;
      if (next < sentences.length) {
        speakSentence(next);
      } else {
        setIsSpeaking(false);
      }
    }; 

    window.speechSynthesis.speak(utterance);
  };
  const play = () => {
    const startIndex = activeSentence ?? 0;
    speakSentence(startIndex);
  };
  const pause = () => {
    window.speechSynthesis.pause();
    setIsSpeaking(false);
  };
  const resume = () => {
    window.speechSynthesis.resume();
    setIsSpeaking(true);
  };
  const stop = () => {
  window.speechSynthesis.cancel();
  setIsSpeaking(false);
  };


  useEffect(() => {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}, [theme]);

//font size slider
const [fontSize, setFontSize] = useState<number>(() => {
  return Number(localStorage.getItem("fontSize")) || 1.05;
});
useEffect(() => {
  localStorage.setItem("fontSize", fontSize.toString());
}, [fontSize]);

// line spacing
const [lineSpacing, setLineSpacing] = useState<number>(() => {
  return Number(localStorage.getItem("lineSpacing")) || 1.75;
});

useEffect(() => {
  localStorage.setItem("lineSpacing", lineSpacing.toString());
}, [lineSpacing]);

useEffect(() => {
  if (activeSentence === null) return;

  const el = document.getElementById(`sentence-${activeSentence}`);
  el?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
}, [activeSentence]);

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (activeSentence === null) return;

    if (e.key === "ArrowRight") {
      setActiveSentence((prev) =>
        prev !== null && prev < sentences.length - 1 ? prev + 1 : prev
      );
    }

    if (e.key === "ArrowLeft") {
      setActiveSentence((prev) =>
        prev !== null && prev > 0 ? prev - 1 : prev
      );
    }
  };

  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, [activeSentence, sentences.length]);

useEffect(() => {
  const loadVoices = () => {
    const available = window.speechSynthesis.getVoices();
    setVoices(available);
    setSelectedVoice(available.find(v => v.lang.startsWith("en")) || available[0]);
  };

  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}, []);

useEffect(() => {
  return () => {
    window.speechSynthesis.cancel();
  };
}, []);
useEffect(() => {
  if (isSpeaking && activeSentence !== null) {
    window.speechSynthesis.cancel();
    speakSentence(activeSentence);
  }
}, [speechRate, selectedVoice]);






return (
  <div className="app-shell" >
    <div className="reader-container">

      {/* HEADER START */}
      <div className="header">
        <h2>📘 PDF Reader (Week 1)</h2>

        <input
          type="file"
          accept="application/pdf"
          onChange={handlePDFUpload}
        />

        {pdfDoc && (
          <div className="controls">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              ◀
            </button>

            <span>
              Page{" "}
              <input
                type="number"
                value={currentPage}
                min={1}
                max={totalPages}
                onChange={(e) => goToPage(Number(e.target.value))}
              />{" "}
              / {totalPages}
            </span>

            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              ▶
            </button>
          </div>
        )}

        {/* BACKGROUND MODE CONTROLS */}
        <div className="controls">
          <span>Background:</span>
          <button onClick={() => setTheme("light")}>☀ Light</button>
          <button onClick={() => setTheme("dark")}>🌙 Dark</button>
          <button onClick={() => setTheme("sepia")}>📜 Sepia</button>
        </div>
      </div>

      {/* Font size */}
      <div className="controls">
        <span>Font size:</span>
          <input
            type="range"
            min="0.9"
            max="1.6"
            step="0.05"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
        />
      </div>
      {/* Line spacing */}
      <div className="controls">
        <span>Line spacing:</span>
          <input
            type="range"
            min="1.4"
            max="2.2"
            step="0.05"
            value={lineSpacing}
            onChange={(e) => setLineSpacing(Number(e.target.value))}
          />
      </div>

      <div className="controls">
        {!isSpeaking ? (
          <button onClick={play}>▶ Play</button>
          ) : (
            <button onClick={pause}>⏸ Pause</button>
            )}
            <button onClick={resume}>⏯ Resume</button>
            <button onClick={stop}>⏹ Stop</button>
      </div>

      <div className="controls">
        <span>Voice:</span>
        <select
        onChange={(e) =>
          setSelectedVoice(voices.find(v => v.name === e.target.value) || null)
        }
        >
        {voices.map((v) => (
          <option key={v.name} value={v.name}>
          {v.name} ({v.lang})
          </option>
        ))}
        </select>
      </div>
      
      <div className="controls">
      <span>Speed:</span>
      <input
        type="range"
        min="0.5"
        max="2"
        step="0.1"
        value={speechRate}
        onChange={(e) => setSpeechRate(Number(e.target.value))}
      />
      </div>



      {/* HEADER END */}

      {loading && <p>Loading page…</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* READER CONTENT */}
      <div
  className="reader"
  style={{
    fontSize: `${fontSize}rem`,
    lineHeight: lineSpacing,
  }}
>
  {sentences.map((s) => (
    <span
      key={s.id}
      id={`sentence-${s.id}`}
      onClick={() => {setActiveSentence(s.id);speakSentence(s.id);}}
      style={{
        backgroundColor:
          activeSentence === s.id
            ? "rgba(255, 230, 150, 0.6)"
            : "transparent",
        cursor: "pointer",
      }}
    >
      {s.text}{" "}
    </span>
  ))}

</div>


    </div>
  </div>
);
}

export default App;
