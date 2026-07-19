"""Render the hand-authored Inventory Lens mark to extension PNG sizes."""

from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "icons"
SOURCE = ROOT / "branding" / "inventory-lens-icon.svg"
SCALE = 8


def point(value: float, size: int) -> int:
    return round(value * size * SCALE / 128)


def render(size: int) -> None:
    canvas = Image.new("RGBA", (size * SCALE, size * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    for x, y in ((14, 14), (60, 14), (14, 60)):
        draw.rounded_rectangle(
            (point(x, size), point(y, size), point(x + 38, size), point(y + 38, size)),
            radius=point(8, size),
            fill="#263346",
            outline="#8B98AA",
            width=max(1, point(4, size)),
        )

    draw.ellipse(
        (point(54, size), point(53, size), point(104, size), point(103, size)),
        fill="#111923",
        outline="#4B91F1",
        width=max(1, point(10, size)),
    )
    draw.line(
        (point(97, size), point(96, size), point(114, size), point(113, size)),
        fill="#4B91F1",
        width=max(1, point(11, size)),
        joint="curve",
    )
    handle_radius = point(11 / 2, size)
    for x, y in ((97, 96), (114, 113)):
        draw.ellipse(
            (
                point(x, size) - handle_radius,
                point(y, size) - handle_radius,
                point(x, size) + handle_radius,
                point(y, size) + handle_radius,
            ),
            fill="#4B91F1",
        )

    canvas.resize((size, size), Image.Resampling.LANCZOS).save(OUT / f"icon-{size}.png")


if not SOURCE.is_file():
    raise FileNotFoundError(f"Missing icon source: {SOURCE}")

for icon_size in (16, 32, 48, 128):
    render(icon_size)
