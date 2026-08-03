import { Fragment, type ReactNode } from "react";

interface ToolbarGroupProps {
  className: string;
  items: ReactNode[];
}

/** `control-separator` (`•`) between each item, matching the original's markup (W3). */
function ToolbarGroup({ className, items }: ToolbarGroupProps) {
  return (
    <div className={className}>
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && <span className="control-separator">•</span>}
          {item}
        </Fragment>
      ))}
    </div>
  );
}

interface ToolbarProps {
  leftControls: ReactNode[];
  rightControls: ReactNode[];
}

/** Bottom toolbar layout container (W3): left/right control groups, `•` separators. */
export function Toolbar({ leftControls, rightControls }: ToolbarProps) {
  return (
    <div className="bottom-toolbar">
      <ToolbarGroup className="left-controls" items={leftControls} />
      <ToolbarGroup className="right-controls" items={rightControls} />
    </div>
  );
}
