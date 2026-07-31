// Turning a member's stored colour into a chip you can read.
//
// `members.color` holds a saturated hex picked when the member was created
// (#C4572A and friends). Ghiaccio never shows those raw: at full strength they
// fight the cyan accent, and white-on-terracotta circles were the loudest thing
// on a list of eighty rows. The design calls for tinted chips instead -- a
// muted field of the member's hue, with the hue itself as the text.
//
// Rather than shipping two hand-written tables (one per theme) this mixes
// against `--card` and `--foreground`, so the same expression darkens in the
// light theme and lightens in the dark one, and a colour nobody has invented
// yet still works. `color-mix` in oklab keeps the hue from drifting the way an
// sRGB mix does.
//
// Pure and client-safe.

export type Tint = { backgroundColor: string; color: string };

export function tint(color: string): Tint {
  return {
    backgroundColor: `color-mix(in oklab, ${color} 20%, var(--card))`,
    color: `color-mix(in oklab, ${color} 72%, var(--foreground))`,
  };
}

// Same field, no text colour: for bars, dots and other marks that are the
// colour rather than carrying text on it.
export function tintField(color: string, strength = 20): string {
  return `color-mix(in oklab, ${color} ${strength}%, var(--card))`;
}

export function tintInk(color: string): string {
  return `color-mix(in oklab, ${color} 72%, var(--foreground))`;
}

// A group has no colour of its own in the database, so it borrows one -- the
// same one every time, because a group that changes colour between renders is
// noise. Hashed from the name rather than the id so it survives an export.
const GROUP_HUES = ["#4A7C8F", "#C47F3A", "#8B5E83", "#6B7C3D", "#9E5A5A", "#6A7BA2"];

export function groupTint(seed: string): Tint {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return tint(GROUP_HUES[h % GROUP_HUES.length]);
}

// "Casa Navona" -> "CN". Falls back to the first two letters of a single word.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
