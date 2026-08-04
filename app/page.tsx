"use client";

import { useEffect, useState } from "react";
import { pickPlaceholder } from "@/src/core/placeholders";
import { otherTheme } from "@/src/core/theme";
import { Editor } from "@/src/ui/components/Editor";
import { useFontControlItems } from "@/src/ui/components/FontControls";
import { SignOutButton } from "@/src/ui/components/SignOutButton";
import { ThemeToggle } from "@/src/ui/components/ThemeToggle";
import { TimerButton } from "@/src/ui/components/TimerButton";
import { Toolbar } from "@/src/ui/components/Toolbar";
import { useEntries } from "@/src/ui/hooks/useEntries";
import { usePreferences } from "@/src/ui/hooks/usePreferences";
import { useSignOut } from "@/src/ui/hooks/useSignOut";
import { useTimer } from "@/src/ui/hooks/useTimer";

export default function Home() {
  const { entry, setBody } = useEntries();
  const { theme, font, fontSize, setTheme, setFont, setFontSize } = usePreferences();
  const timer = useTimer();
  const signOut = useSignOut();
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
            faded={timer.status === "complete"}
          />
        )}
        <Toolbar
          leftControls={fontControls.items}
          rightControls={[
            <TimerButton key="timer" label={timer.label} onClick={timer.toggle} />,
            <ThemeToggle key="theme" theme={theme} onToggle={() => setTheme(otherTheme(theme))} />,
            <SignOutButton key="sign-out" onClick={signOut} />,
          ]}
        />
      </div>
    </div>
  );
}
