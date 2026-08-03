import type { ChangeEvent } from "react";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  fontFamily: string;
  fontSize: number;
  /** T3: fades the text to 30% opacity for 5s when the timer completes. */
  faded?: boolean;
}

/**
 * The textarea (E1-E6). Plain, controlled `<textarea>` — no contenteditable,
 * for IME and mobile-keyboard behavior a rich editor doesn't get for free.
 */
export function Editor({ value, onChange, placeholder, fontFamily, fontSize, faded = false }: EditorProps) {
  const showPlaceholder = value.trim() === "";
  const fontStyle = { fontFamily, fontSize };

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
  }

  return (
    <div className="editor-container">
      {showPlaceholder && (
        <div className="placeholder" style={fontStyle}>
          {placeholder}
        </div>
      )}
      <textarea
        className={faded ? "editor faded" : "editor"}
        style={fontStyle}
        spellCheck={false}
        value={value}
        onChange={handleChange}
        aria-label="Freewrite entry"
      />
    </div>
  );
}
