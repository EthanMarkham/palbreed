import type { Pal } from "../domain/pal";

type PalAvatarProps = {
  pal: Pal;
  className?: string;
};

export default function PalAvatar({ pal, className }: PalAvatarProps) {
  return (
    <img
      className={["pal-avatar", className].filter(Boolean).join(" ")}
      src={pal.image}
      alt=""
      loading="lazy"
      decoding="async"
      aria-hidden="true"
    />
  );
}
