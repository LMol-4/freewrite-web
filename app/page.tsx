"use client";

import { useEffect, useState } from "react";
import { pickPlaceholder } from "@/src/core/placeholders";
import { otherTheme } from "@/src/core/theme";
import { Editor } from "@/src/ui/components/Editor";
import { useFontControlItems } from "@/src/ui/components/FontControls";
import { ThemeToggle } from "@/src/ui/components/ThemeToggle";
import { Toolbar } from "@/src/ui/components/Toolbar";
import { useEntries } from "@/src/ui/hooks/useEntries";
import { usePreferences } from "@/src/ui/hooks/usePreferences";

export default function Home() {
  const { entry, setBody } = useEntries();
  const { theme, font, fontSize, setTheme, setFont, setFontSize } = usePreferences();
  const [placeholder] = useState(() => pickPlaceholder());

  // H1/H2: the blocking script in the root layout sets `data-theme` before
  // first paint; this keeps it in sync with every toggle after that.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
        <Toolbar
          leftControls={fontControls.items}
          rightControls={[<ThemeToggle key="theme" theme={theme} onToggle={() => setTheme(otherTheme(theme))} />]}
        />
      </div>
    </div>
  );
}
