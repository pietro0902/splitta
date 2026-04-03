"use client";

import { motion } from "framer-motion";

export function MemberAvatar({
  name,
  color,
  size = "md",
}: {
  name: string;
  color: string;
  size?: "sm" | "md" | "lg";
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const sizeClasses = {
    sm: "size-7 text-[10px]",
    md: "size-9 text-xs",
    lg: "size-12 text-sm",
  };

  return (
    <motion.div
      whileHover={{ scale: 1.1 }}
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-semibold text-white shrink-0 shadow-sm`}
      style={{ backgroundColor: color }}
      title={name}
    >
      {initials}
    </motion.div>
  );
}

export function MemberAvatarStack({
  members,
  max = 4,
}: {
  members: { name: string; color: string }[];
  max?: number;
}) {
  const visible = members.slice(0, max);
  const remaining = members.length - max;

  return (
    <div className="flex -space-x-2">
      {visible.map((m, i) => (
        <div key={i} className="relative" style={{ zIndex: max - i }}>
          <MemberAvatar name={m.name} color={m.color} size="sm" />
        </div>
      ))}
      {remaining > 0 && (
        <div className="size-7 rounded-full flex items-center justify-center text-[10px] font-semibold bg-muted text-muted-foreground border-2 border-background relative">
          +{remaining}
        </div>
      )}
    </div>
  );
}
