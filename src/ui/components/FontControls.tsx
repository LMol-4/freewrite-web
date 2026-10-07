import { Fragment, type ReactNode, useCallback, useRef, useState } from "react";
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
  const closeSize = useCallback(() => setSizePopupOpen(false), []);
  const sizeButtonRef = useRef<HTMLButtonElement>(null);

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
      <button type="button"
        key={mode}
        aria-pressed={fontMode === mode}
        className="control-item"
        style={{ fontWeight: fontMode === mode ? "bold" : "normal" }}
        onClick={() => onFontModeChange(mode)}
      >
        {label}
      </button>
    );
  }

  const items = [
    <Fragment key="size">
      <button type="button" ref={sizeButtonRef} aria-expanded={sizePopupOpen} aria-label="Font size" className="control-item" onClick={() => setSizePopupOpen((open) => !open)}>
        {fontSize}px
      </button>
      {sizePopupOpen && (
        <Popup anchorRef={sizeButtonRef} onClose={closeSize}>
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
    <button type="button"
      key="random"
      aria-pressed={fontMode === "random"}
      className="control-item"
      style={{ fontWeight: fontMode === "random" ? "bold" : "normal" }}
      onClick={handleRandomClick}
    >
      {randomPick ? `Random [${randomPick}]` : "Random"}
    </button>,
  ];

  const fontFamily = resolveFontFamily(fontMode, randomPick ?? undefined);

  return { items, fontFamily };
}
