import { tint, initials } from "@/lib/tints";

// A member reads as a tinted rounded square, not a saturated circle. Squares
// because the whole system is built on rounded rectangles, and tinted because
// eighty rows of full-strength colour is the fastest way to make a list
// unreadable. See src/lib/tints.ts for why the colours are mixed rather than
// tabulated.
//
// Deliberately not a client component and deliberately unanimated: it is the
// single most repeated element in the app, so it renders on the server and
// costs nothing on the wire.
const SIZES = {
  sm: "size-6 text-[10px] rounded-[7px]",
  md: "size-[29px] text-[11px] rounded-[9px]",
  lg: "size-10 text-sm rounded-xl",
} as const;

export function MemberAvatar({
  name,
  color,
  size = "md",
  className = "",
}: {
  name: string;
  color: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={`${SIZES[size]} flex items-center justify-center font-medium shrink-0 ${className}`}
      style={tint(color)}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

// The overlapping stack that used to sit on every expense row is gone: rows now
// show the payer's monogram and name the payers in the line below it, which is
// both clearer and one element instead of four. Nothing imports a stack any
// more, so there is not one here.
