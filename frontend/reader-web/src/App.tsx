import { useState, useEffect } from "react";
import pdfjsLib from "./pdfWorker";
import "./App.css";

type Paragraph = {
  text: string;
};

function App() {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  

  
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

  /* ===============================
     Render Readable Text
     =============================== */
  const renderReadableText = (lines: string[]) => {
    setParagraphs(
      lines
        .map((l) => ({ text: l.replace(/\s+/g, " ").trim() }))
        .filter((p) => p.text.length > 0)
    );
  };

  /* ===============================
     Navigation
     =============================== */
  const goToPage = async (page: number) => {
    if (!pdfDoc || page < 1 || page > totalPages) return;
    setCurrentPage(page);
    await extractTextFromPage(pdfDoc, page);
  };

  //theme
  const [theme, setTheme] = useState<"light" | "dark" | "sepia">(() => {
  return (localStorage.getItem("theme") as "light" | "dark" | "sepia") || "light";
});

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
  {paragraphs.map((p, i) => (
    <p key={i}>{p.text}</p>
  ))}
</div>


    </div>
  </div>
);
}

export default App;
