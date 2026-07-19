from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


PAPER = (244, 241, 231, 255)
INK = (20, 32, 27, 255)
TEAL = (35, 133, 109, 255)
TEAL_DARK = (22, 103, 83, 255)
LIME_STRONG = (197, 232, 112, 255)
GRID = (235, 233, 223, 255)


def extract_mark(source: Path) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    pixels = image.load()
    width, height = image.size
    has_transparency = image.getchannel("A").getextrema()[0] < 255

    rgba = Image.new("RGBA", image.size)
    output = rgba.load()
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if has_transparency:
                output[x, y] = (red, green, blue, alpha) if alpha > 8 else (0, 0, 0, 0)
                continue
            luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
            # The source is a flat silhouette on a very light warm background.
            # A crisp mask avoids carrying a pale fringe into dark UI contexts;
            # final-size Lanczos resampling restores clean antialiasing.
            output[x, y] = (red, green, blue, 255) if luminance < 180 else (0, 0, 0, 0)

    alpha_channel = rgba.getchannel("A")
    bbox = alpha_channel.point(lambda value: 255 if value > 8 else 0).getbbox()
    if bbox is None:
        raise RuntimeError("No foreground mark was detected")

    left, top, right, bottom = bbox
    padding = round(max(right - left, bottom - top) * 0.045)
    crop_box = (
        max(0, left - padding),
        max(0, top - padding),
        min(width, right + padding),
        min(height, bottom + padding),
    )
    return rgba.crop(crop_box)


def mix_color(low: tuple[int, int, int, int], high: tuple[int, int, int, int], amount: float) -> tuple[int, int, int]:
    amount = max(0.0, min(1.0, amount))
    return tuple(round(start + (end - start) * amount) for start, end in zip(low[:3], high[:3]))


def field_palette_mark(mark: Image.Image) -> Image.Image:
    """Apply the original Palpath ink, teal, and lime palette without changing the mark."""
    recolored = Image.new("RGBA", mark.size, (0, 0, 0, 0))
    source = mark.load()
    output = recolored.load()
    width_scale = max(1, mark.width - 1)
    height_scale = max(1, mark.height - 1)

    for y in range(mark.height):
        for x in range(mark.width):
            _, _, _, alpha = source[x, y]
            if alpha == 0:
                continue

            horizontal = x / width_scale
            vertical = y / height_scale
            is_signpost = horizontal >= 0.56 and vertical < 0.88
            if is_signpost:
                color = mix_color(TEAL, LIME_STRONG, (horizontal - 0.56) / 0.44)
            else:
                color = mix_color(INK, TEAL_DARK, min(1.0, horizontal / 0.62) * 0.42)
            output[x, y] = (*color, alpha)

    return recolored


def contain(mark: Image.Image, size: tuple[int, int], padding: int = 0) -> Image.Image:
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    available = (size[0] - padding * 2, size[1] - padding * 2)
    fitted = mark.copy()
    fitted.thumbnail(available, Image.Resampling.LANCZOS)
    position = ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2)
    canvas.alpha_composite(fitted, position)
    return canvas


def dark_mode_mark(mark: Image.Image) -> Image.Image:
    recolored = Image.new("RGBA", mark.size, (0, 0, 0, 0))
    source = mark.load()
    output = recolored.load()
    low = (184, 225, 214)
    high = (86, 197, 188)
    for y in range(mark.height):
        for x in range(mark.width):
            red, green, blue, alpha = source[x, y]
            if alpha == 0:
                continue
            luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
            mix = max(0.0, min(1.0, (luminance - 24) / 86))
            color = tuple(round(start + (end - start) * mix) for start, end in zip(low, high))
            output[x, y] = (*color, alpha)
    return recolored


def rounded_icon(mark: Image.Image, size: int) -> Image.Image:
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(icon)
    radius = max(3, round(size * 0.2))
    inset = max(1, round(size * 0.03))
    draw.rounded_rectangle((inset, inset, size - inset - 1, size - inset - 1), radius, fill=PAPER)
    fitted = contain(mark, (size, size), round(size * 0.11))
    icon.alpha_composite(fitted)
    return icon


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        Path("C:/Windows/Fonts/bahnschrift.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def social_card(mark: Image.Image) -> Image.Image:
    card = Image.new("RGBA", (1200, 630), PAPER)
    draw = ImageDraw.Draw(card)
    for x in range(0, card.width, 42):
        draw.line((x, 0, x, card.height), fill=GRID, width=1)
    for y in range(0, card.height, 42):
        draw.line((0, y, card.width, y), fill=GRID, width=1)

    mark_panel = contain(mark, (470, 410), 28)
    card.alpha_composite(mark_panel, (48, 110))

    title_font = load_font(88, bold=True)
    body_font = load_font(27)
    draw.text((540, 218), "PALPATH", fill=INK, font=title_font, spacing=2)
    draw.text((546, 326), "Inventory + breeding routes", fill=(47, 61, 53, 255), font=body_font)
    draw.rounded_rectangle((546, 388, 760, 394), radius=3, fill=TEAL)
    return card.convert("RGB")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Palpath brand assets from the selected source mark")
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    mark = field_palette_mark(extract_mark(args.source))

    master = contain(mark, (1024, 768), 24)
    master.save(args.output / "palpath-mark.png", optimize=True)
    contain(mark, (512, 384), 12).save(args.output / "palpath-mark-512.png", optimize=True)
    dark_mark = dark_mode_mark(mark)
    contain(dark_mark, (1024, 768), 24).save(args.output / "palpath-mark-dark.png", optimize=True)
    contain(dark_mark, (512, 384), 12).save(args.output / "palpath-mark-dark-512.png", optimize=True)

    favicon = rounded_icon(mark, 64)
    favicon.save(args.output.parent / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    rounded_icon(mark, 32).save(args.output.parent / "favicon-32.png", optimize=True)
    rounded_icon(mark, 180).save(args.output.parent / "apple-touch-icon.png", optimize=True)
    rounded_icon(mark, 192).save(args.output.parent / "icon-192.png", optimize=True)
    rounded_icon(mark, 512).save(args.output.parent / "icon-512.png", optimize=True)
    social_card(mark).save(args.output.parent / "palpath-social-card.png", optimize=True)


if __name__ == "__main__":
    main()
