"use client";

import { createPortal } from "react-dom";
import { EllipsisVertical } from "lucide-react";
import MenuItem from "@/components/MenuItem";
import { usePopover } from "@/lib/use-popover";

const PANEL_WIDTH = 224;
const ITEM_HEIGHT = 44;

export default function ActionMenu({
  items,
  label = "Tuỳ chọn",
  icon: Icon = EllipsisVertical,
  className = "",
  buttonClassName = "",
  placement = "auto",
}) {
  const { open, style, toggle, close, rootRef, buttonRef, panelRef } = usePopover({
    width: PANEL_WIDTH,
    heightEstimate: items.length * ITEM_HEIGHT + 16,
    placement,
  });

  return (
    <div ref={rootRef} className={className}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`icon-btn ${buttonClassName}`}
      >
        <Icon size={19} />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={label}
            style={style}
            className="menu-pop fixed z-[65] w-56 overflow-hidden rounded-2xl border-2 border-border bg-surface-2 py-1.5 shadow-2xl"
          >
            {items.map((item) => (
              <MenuItem
                key={item.label}
                icon={item.icon}
                danger={item.danger}
                onClick={() => {
                  item.onClick();
                  close();
                }}
              >
                {item.label}
              </MenuItem>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
