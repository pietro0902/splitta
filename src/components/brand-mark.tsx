// The Splitta mark: a receipt knocked out of a filled tile, so the shape you
// recognise is the void rather than the ink. Chosen over a folded banknote
// because the receipt is what this app actually does -- the scanner is the
// reason it exists -- and because a full-bleed tile survives being an icon at
// 22px, where a line-drawn note turns to mush.
//
// The void is painted, not transparent, so the mark reads on any surface it is
// dropped on; `voidColor` is the surface it sits on.
export function BrandMark({
  size = 28,
  voidColor = "var(--background)",
  className,
}: {
  size?: number;
  voidColor?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Splitta"
    >
      <rect width="100" height="100" rx="23" fill="currentColor" />
      {/* Same geometry as mark() in scripts/generate-icons.mjs, in the icon's
          -1..1 space mapped onto this 0..100 viewBox. Keep them in step. */}
      <path
        d="M30 23 H70 V70 L60 77 L50 70 L40 77 L30 70 Z"
        fill={voidColor}
        stroke={voidColor}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <rect x="38" y="38" width="24" height="6" rx="3" fill="currentColor" />
      <rect x="38" y="51" width="14" height="6" rx="3" fill="currentColor" />
    </svg>
  );
}
