import { Fragment, type ReactNode, useRef, useState } from "react";
import {
  FONT_SIZES,
  type FontMode,
  type FontSize,
  type RandomFont,
  pickRandomFont,
  resolveFontFamily,
} from "../../core/fonts";
import { Popup } from "./Popup";

interface FontControlsProps {
  fontMode: FontMode;
  fontSize: FontSize;
  onFontModeChange: (mode: FontMode) => void;
  onFontSizeChange: (size: FontSize) => void;
}

interface FontControls {
  items: ReactNode[];
  /** The resolved CSS `font-family` for the editor — tracks the ephemeral random pick. */
  fontFamily: string;
}

/**
 * F1-F5: four font buttons plus the size popup. A hook rather than a single
 * component because the toolbar (W3) renders each button as its own
 * `•`-separated item, not one grouped block — see `Toolbar`/`ToolbarGroup`.
 */
export function useFontControlItems({
  fontMode,
  fontSize,
  onFontModeChange,
  onFontSizeChange,
}: FontControlsProps): FontControls {
  const [randomPick, setRandomPick] = useState<RandomFont | null>(() =>
    fontMode === "random" ? pickRandomFont() : null,
  );
  const [sizePopupOpen, setSizePopupOpen] = useState(false);
  const sizeButtonRef = useRef<HTMLSpanElement>(null);

  // §18 resolved question 5 / D12: only the mode syncs — each device re-rolls
  // its own pick, including when "random" is restored from localStorage.
  // Adjusted during render (not an effect) per React's guidance for state
  // that tracks a prop transition — see "Adjusting state based on a prop
  // change" in the Effects docs.
  const [prevFontMode, setPrevFontMode] = useState(fontMode);
  if (fontMode !== prevFontMode) {
    setPrevFontMode(fontMode);
    if (fontMode === "random") {
      setRandomPick(pickRandomFont());
    }
  }

  function handleRandomClick() {
    setRandomPick(pickRandomFont());
    if (fontMode !== "random") onFontModeChange("random");
  }

  function fontItem(mode: FontMode, label: string) {
    return (
      <span
        key={mode}
        className="control-item"
        style={{ fontWeight: fontMode === mode ? "bold" : "normal" }}
        onClick={() => onFontModeChange(mode)}
      >
        {label}
      </span>
    );
  }

  const items = [
    <Fragment key="size">
      <span ref={sizeButtonRef} className="control-item" onClick={() => setSizePopupOpen((open) => !open)}>
        {fontSize}px
      </span>
      {sizePopupOpen && (
        <Popup anchorRef={sizeButtonRef} onClose={() => setSizePopupOpen(false)}>
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              className="size-option"
              onClick={() => {
                onFontSizeChange(size);
                setSizePopupOpen(false);
              }}
            >
              {size}px
            </button>
          ))}
        </Popup>
      )}
    </Fragment>,
    fontItem("lato", "Lato"),
    fontItem("system", "System"),
    fontItem("serif", "Serif"),
    <span
      key="random"
      className="control-item"
      style={{ fontWeight: fontMode === "random" ? "bold" : "normal" }}
      onClick={handleRandomClick}
    >
      {randomPick ? `Random [${randomPick}]` : "Random"}
    </span>,
  ];

  const fontFamily = resolveFontFamily(fontMode, randomPick ?? undefined);

  return { items, fontFamily };
}
