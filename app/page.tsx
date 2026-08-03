"use client";

import { useState } from "react";
import { pickPlaceholder } from "@/src/core/placeholders";
import { Editor } from "@/src/ui/components/Editor";
import { useFontControlItems } from "@/src/ui/components/FontControls";
import { Toolbar } from "@/src/ui/components/Toolbar";
import { useEntries } from "@/src/ui/hooks/useEntries";
import { usePreferences } from "@/src/ui/hooks/usePreferences";

export default function Home() {
  const { entry, setBody } = useEntries();
  const { font, fontSize, setFont, setFontSize } = usePreferences();
  const [placeholder] = useState(() => pickPlaceholder());

  const fontControls = useFontControlItems({
    fontMode: font,
    fontSize,
    onFontModeChange: setFont,
    onFontSizeChange: setFontSize,
  });

  return (
    <div className="app-container">
      <div className="main-content">
        {entry && (
          <Editor
            value={entry.body}
            onChange={setBody}
            placeholder={placeholder}
            fontFamily={fontControls.fontFamily}
            fontSize={fontSize}
          />
        )}
        <Toolbar leftControls={fontControls.items} rightControls={[]} />
      </div>
    </div>
  );
}
