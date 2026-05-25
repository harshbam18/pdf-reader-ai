import type { ChangeEvent } from "react";
import {
  AlignJustify,
  Sun,
  Moon,
  BookOpenText,
  Type,
  Upload,
} from "lucide-react";

type Props = {
  readingProgress: number;
  bookTitle: string;
  currentChapterTitle?: string;
  handlePDFUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  theme: "light" | "dark" | "sepia";
  setTheme: (theme: "light" | "dark" | "sepia") => void;
  readingMode: "compact" | "comfort" | "book";
  setReadingMode: (value: "compact" | "comfort" | "book") => void;
  fontSize: number;
  lineSpacing: number;
  setFontSize: (value: number) => void;
  setLineSpacing: (value: number) => void;
};

export default function ReaderHeader({
  readingProgress,
  bookTitle,
  currentChapterTitle,
  handlePDFUpload,
  theme,
  setTheme,
  readingMode,
  setReadingMode,
  fontSize,
  lineSpacing,
  setFontSize,
  setLineSpacing,
}: Props) {
  return (
    <div className="header header-toolbar top-toolbar">
      <div className="toolbar-left">
        <div className="book-identity">
          <span className="book-title">
            {bookTitle}
          </span>
          {currentChapterTitle && (
            <span className="chapter-chip">
              {currentChapterTitle}
            </span>
          )}
        </div>

        <div className="file-pill">
          <label>
            <Upload size={16} />
            <span>Upload PDF</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={handlePDFUpload}
            />
          </label>
        </div>

        <span className="reading-progress">
          {readingProgress}% read
        </span>
        <div className="header-progress-track">
          <div
            className="header-progress-fill"
            style={{
              width: `${readingProgress}%`,
            }}
          />
        </div>
      </div>

      <div className="toolbar-center">
        <div className="reading-mode-group">
          <button
            className={
              readingMode === "compact"
                ? "toolbar-active"
                : ""
            }
            onClick={() =>
              setReadingMode("compact")
            }
          >
            Compact
          </button>

          <button
            className={
              readingMode === "comfort"
                ? "toolbar-active"
                : ""
            }
            onClick={() =>
              setReadingMode("comfort")
            }
          >
            Comfort
          </button>

          <button
            className={
              readingMode === "book"
                ? "toolbar-active"
                : ""
            }
            onClick={() =>
              setReadingMode("book")
            }
          >
            Book
          </button>
        </div>

        <div className="toolbar-reading-controls">
          <div className="toolbar-slider">
            <Type size={16} />
            <input
              type="range"
              min="1"
              max="1.6"
              step="0.01"
              value={fontSize}
              onChange={(e) =>
                setFontSize(
                  Number(e.target.value)
                )
              }
            />
          </div>

          <div className="toolbar-slider">
            <AlignJustify size={16} />
            <input
              type="range"
              min="1.6"
              max="2.6"
              step="0.05"
              value={lineSpacing}
              onChange={(e) =>
                setLineSpacing(
                  Number(e.target.value)
                )
              }
            />
          </div>
        </div>
      </div>

      <div className="toolbar-right">
        <button
          title="Light theme"
          className={
            theme === "light"
              ? "theme-button active-theme"
              : "theme-button"
          }
          onClick={() => setTheme("light")}
        >
          <Sun size={18} />
        </button>
        <button
          title="Dark theme"
          className={
            theme === "dark"
              ? "theme-button active-theme"
              : "theme-button"
          }
          onClick={() => setTheme("dark")}
        >
          <Moon size={18} />
        </button>
        <button
          title="Sepia theme"
          className={
            theme === "sepia"
              ? "theme-button active-theme"
              : "theme-button"
          }
          onClick={() => setTheme("sepia")}
        >
          <BookOpenText size={18} />
        </button>
      </div>
    </div>
  );
}
