import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import "../styles/Modal.css";

export type ModalType = "confirm" | "prompt";

type ModalProps = {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
};

export default function Modal({
  isOpen,
  type,
  title,
  message,
  placeholder = "",
  defaultValue = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
}: ModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && type === "prompt" && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen, type]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (type === "prompt" && inputRef.current) {
      onConfirm(inputRef.current.value);
    } else {
      onConfirm();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirm();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button
            className="modal-close"
            onClick={onCancel}
            title="Close"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-message">{message}</p>
          {type === "prompt" && (
            <input
              ref={inputRef}
              type="text"
              className="modal-input"
              placeholder={placeholder}
              defaultValue={defaultValue}
              onKeyDown={handleKeyDown}
            />
          )}
        </div>

        <div className="modal-actions">
          <button
            className="modal-button modal-cancel"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            className="modal-button modal-confirm"
            onClick={handleConfirm}
            onKeyDown={handleKeyDown}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
