"use client";

import { useState } from "react";
import { pickPlaceholder } from "@/src/core/placeholders";
import { Editor } from "@/src/ui/components/Editor";
import { useEntries } from "@/src/ui/hooks/useEntries";

// D7: Lato is the honest default (not random). Wired to real font controls in
// a later commit.
const DEFAULT_FONT_FAMILY = "var(--font-lato)";
const DEFAULT_FONT_SIZE = 18;

export default function Home() {
  const { entry, setBody } = useEntries();
  const [placeholder] = useState(() => pickPlaceholder());

  return (
    <div className="app-container">
      <div className="main-content">
        {entry && (
          <Editor
            value={entry.body}
            onChange={setBody}
            placeholder={placeholder}
            fontFamily={DEFAULT_FONT_FAMILY}
            fontSize={DEFAULT_FONT_SIZE}
          />
        )}
      </div>
    </div>
  );
}
