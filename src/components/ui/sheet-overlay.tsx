"use client";

import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

// The dimmed backdrop every sheet in the app sits on, and the one place that
// class string exists.
//
// It renders into <body>, which is not a detail: `position: fixed` resolves
// against the viewport only until some ancestor establishes a containing block,
// and `backdrop-filter` does exactly that -- as do `filter`, `transform` and
// `contain: paint`. Ghiaccio's frosted bars are `backdrop-blur-xl`, so a sheet
// opened from the group header was laid out inside that 60px strip instead of
// the screen: measured, the overlay came back 60px tall against a 910px
// viewport, which on a desktop centres the panel half off the top edge.
//
// Portalling also keeps a sheet alive when the container its trigger lives in
// is hidden at a breakpoint -- the header actions are `hidden lg:flex` and the
// bottom bar is `lg:hidden`, so without this, resizing across `lg` with a sheet
// open tore the sheet out of the DOM along with whatever had been typed into it.
//
// `AnimatePresence` still drives the exit: it sees this component as its child
// and React context reaches the `motion` elements through the portal.
export function SheetOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  // Only ever reached behind an `open` flag, which is false on the server.
  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {children}
    </motion.div>,
    document.body
  );
}
