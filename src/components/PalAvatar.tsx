import type { CSSProperties } from "react";
import type { Pal } from "../domain/pal";

type PalAvatarProps = {
  pal: Pal;
  className?: string;
};

type AvatarStyle = CSSProperties & {
  "--pal-avatar-hue": string;
};

function getInitials(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "P";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1]?.[0] ?? ""}`.toUpperCase();
}

function getHue(id: string): number {
  let hash = 0;
  for (const character of id) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export default function PalAvatar({ pal, className }: PalAvatarProps) {
  const style: AvatarStyle = { "--pal-avatar-hue": String(getHue(pal.id)) };

  return (
    <span
      className={["pal-avatar", className].filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
    >
      <strong>{getInitials(pal.name)}</strong>
      <small>#{String(pal.number).padStart(3, "0")}</small>
    </span>
  );
}
