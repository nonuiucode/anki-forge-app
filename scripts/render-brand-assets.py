#!/usr/bin/env python3
"""Render ocean, silver-chip, crimson-apple & poker-suit Android icons and splash PNGs."""

from __future__ import annotations

from pathlib import Path

import pymupdf

REPO_ROOT = Path(__file__).resolve().parent.parent
RES_DIR = REPO_ROOT / "android" / "app" / "src" / "main" / "res"

ICON_DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}

SPLASH_SIZES = {
    "drawable/splash.png": (480, 320),
    "drawable-port-mdpi/splash.png": (320, 480),
    "drawable-port-hdpi/splash.png": (480, 800),
    "drawable-port-xhdpi/splash.png": (720, 1280),
    "drawable-port-xxhdpi/splash.png": (960, 1600),
    "drawable-port-xxxhdpi/splash.png": (1280, 1920),
    "drawable-land-mdpi/splash.png": (480, 320),
    "drawable-land-hdpi/splash.png": (800, 480),
    "drawable-land-xhdpi/splash.png": (1280, 720),
    "drawable-land-xxhdpi/splash.png": (1600, 960),
    "drawable-land-xxxhdpi/splash.png": (1920, 1280),
}


def coin_apple_emblem(cx: float, cy: float, radius: float) -> str:
    """Return crisp solid/translucent vector SVG group (no gradients for universal rasterizers)."""
    s = radius / 44.0
    return f"""
  <g transform="translate({cx - 64 * s:.2f} {cy - 64 * s:.2f}) scale({s:.4f})">
    <circle cx="64" cy="64" r="46" fill="none" stroke="#DCE8F5" stroke-width="8" stroke-dasharray="15.5 7"/>
    <circle cx="64" cy="64" r="38" fill="#0B274D" stroke="#F0F6FC" stroke-width="2"/>
    <circle cx="64" cy="64" r="32" fill="none" stroke="#6EB0EE" stroke-width="1.2" stroke-dasharray="3.2 4.2" opacity="0.72"/>
    <path d="M64 16 L67.2 21 L64 26 L60.8 21 Z" fill="#FFFFFF"/>
    <path d="M64 102 L67.2 107 L64 112 L60.8 107 Z" fill="#FFFFFF"/>
    <path d="M16 64 L21 60.8 L26 64 L21 67.2 Z" fill="#FFFFFF"/>
    <path d="M102 64 L107 60.8 L112 64 L107 67.2 Z" fill="#FFFFFF"/>
    <path d="M64.6 40.5 C65 34.5 68 30.8 71.8 29" fill="none" stroke="#E2ECF7" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M66.4 36.8 C72.6 32.5 78.6 34.5 79 39.5 C73.6 41 68.8 39.6 66.4 36.8 Z" fill="#5EEAD4"/>
    <path d="M64 46 C58.6 42 47.6 44.2 45 55.2 C42.3 67.2 49.2 84 57.4 86.2 C60.7 87.1 62.5 85 64 85 C65.5 85 67.3 87.1 70.6 86.2 C78.8 84 85.7 67.2 83 55.2 C80.4 44.2 69.4 42 64 46 Z" fill="#D42F4B" stroke="#FFD6DD" stroke-width="1.5"/>
    <path d="M64 46 C70 43.2 79.4 46 82 55.2 C84.5 66 78.6 81.5 71 84.8 C74.5 76.5 75.5 60.5 69.2 49.8 C67.6 47.4 65.8 46.5 64 46 Z" fill="#9E1B32" opacity="0.52"/>
    <ellipse cx="53.6" cy="54.8" rx="3.2" ry="6.6" transform="rotate(-18 53.6 54.8)" fill="#FFFFFF" opacity="0.48"/>
  </g>"""


def render_svg_to_png(svg_markup: str, width: int, height: int, alpha: bool, out_path: Path) -> None:
    doc = pymupdf.open(stream=svg_markup.encode("utf-8"), filetype="svg")
    try:
        page = doc[0]
        rect = page.rect
        sx = width / rect.width
        sy = height / rect.height
        pix = page.get_pixmap(matrix=pymupdf.Matrix(sx, sy), alpha=alpha)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        pix.save(str(out_path))
    finally:
        doc.close()


def main() -> None:
    for density, (icon_px, fg_px) in ICON_DENSITIES.items():
        # Adaptive foreground (transparent background, artwork centered inside 66% safe mask)
        fg_svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="{fg_px}" height="{fg_px}">'
            + coin_apple_emblem(54, 54, 31)
            + "</svg>"
        )
        render_svg_to_png(
            fg_svg,
            fg_px,
            fg_px,
            True,
            RES_DIR / f"mipmap-{density}" / "ic_launcher_foreground.png",
        )

        # Rounded-square legacy icon (zero clipPath dependence; inner highlights strictly inside bounds)
        sq_svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="{icon_px}" height="{icon_px}">'
            '<rect x="4" y="4" width="120" height="120" rx="28" fill="#0A2447"/>'
            '<circle cx="64" cy="56" r="46" fill="#134580" opacity="0.52"/>'
            '<path d="M5 90 Q36 78 64 90 T123 90 L123 96 C123 111 111 123 96 123 L32 123 C17 123 5 111 5 96 Z" fill="#1D62A8" opacity="0.58"/>'
            '<path d="M8 103 Q40 93 74 103 T120 101 C116 115 107 123 96 123 L32 123 C21 123 12 115 8 103 Z" fill="#3B89D4" opacity="0.30"/>'
            '<rect x="4" y="4" width="120" height="120" rx="28" fill="none" stroke="#3B79B8" stroke-width="2.5"/>'
            + coin_apple_emblem(64, 64, 44)
            + "</svg>"
        )
        render_svg_to_png(
            sq_svg,
            icon_px,
            icon_px,
            True,
            RES_DIR / f"mipmap-{density}" / "ic_launcher.png",
        )

        # Round icon (zero clipPath dependence; waves bounded inside r=59 circle)
        rnd_svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="{icon_px}" height="{icon_px}">'
            '<circle cx="64" cy="64" r="60" fill="#0A2447"/>'
            '<circle cx="64" cy="56" r="46" fill="#134580" opacity="0.52"/>'
            '<path d="M9 88 Q36 76 64 88 T119 88 A59 59 0 0 1 9 88 Z" fill="#1D62A8" opacity="0.58"/>'
            '<path d="M18 102 Q44 93 74 102 T110 102 A59 59 0 0 1 18 102 Z" fill="#3B89D4" opacity="0.30"/>'
            '<circle cx="64" cy="64" r="60" fill="none" stroke="#3B79B8" stroke-width="2.5"/>'
            + coin_apple_emblem(64, 64, 44)
            + "</svg>"
        )
        render_svg_to_png(
            rnd_svg,
            icon_px,
            icon_px,
            True,
            RES_DIR / f"mipmap-{density}" / "ic_launcher_round.png",
        )

    # Splash screens (exact opaque sizes, layered deep ocean waves + drifting card + centered emblem)
    for rel_path, (w, h) in SPLASH_SIZES.items():
        min_dim = min(w, h)
        emblem_r = min_dim * 0.17
        wave_y1 = h * 0.71
        wave_y2 = h * 0.80
        wave_y3 = h * 0.89
        dot_r = max(1.8, min_dim * 0.005)
        card_w = min_dim * 0.165
        card_h = card_w * 1.38
        splash_svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
  <rect width="{w}" height="{h}" fill="#081C38"/>
  <circle cx="{w*0.5:.1f}" cy="{h*0.44:.1f}" r="{max(w, h)*0.48:.1f}" fill="#0F3464" opacity="0.65"/>
  <circle cx="{w*0.5:.1f}" cy="{h*0.45:.1f}" r="{min_dim*0.38:.1f}" fill="#174D8A" opacity="0.32"/>
  <path d="M0 {wave_y1:.1f} Q{w*0.25:.1f} {wave_y1 - min_dim*0.06:.1f} {w*0.5:.1f} {wave_y1:.1f} T{w} {wave_y1:.1f} L{w} {h} L0 {h} Z" fill="#134278" opacity="0.72"/>
  <path d="M0 {wave_y2:.1f} Q{w*0.28:.1f} {wave_y2 + min_dim*0.05:.1f} {w*0.56:.1f} {wave_y2:.1f} T{w} {wave_y2 - min_dim*0.02:.1f} L{w} {h} L0 {h} Z" fill="#1C5C9E" opacity="0.62"/>
  <path d="M0 {wave_y3:.1f} Q{w*0.32:.1f} {wave_y3 - min_dim*0.04:.1f} {w*0.64:.1f} {wave_y3:.1f} T{w} {wave_y3 + min_dim*0.02:.1f} L{w} {h} L0 {h} Z" fill="#3B89D4" opacity="0.34"/>
  <g transform="translate({w*0.76:.1f} {h*0.17:.1f}) rotate(11)" opacity="0.24">
    <rect x="0" y="0" width="{card_w:.1f}" height="{card_h:.1f}" rx="{card_w*0.12:.1f}" fill="#0D294F" stroke="#DCE8F5" stroke-width="{max(1.5, min_dim*0.004):.1f}"/>
    <rect x="{card_w*0.08:.1f}" y="{card_h*0.06:.1f}" width="{card_w*0.84:.1f}" height="{card_h*0.88:.1f}" rx="{card_w*0.08:.1f}" fill="none" stroke="#9EC4EB" stroke-width="{max(1.0, min_dim*0.0025):.1f}" stroke-dasharray="5 4"/>
    <path d="M{card_w*0.5:.1f} {card_h*0.34:.1f} L{card_w*0.62:.1f} {card_h*0.5:.1f} L{card_w*0.5:.1f} {card_h*0.66:.1f} L{card_w*0.38:.1f} {card_h*0.5:.1f} Z" fill="#E2EEFA"/>
  </g>
  <g transform="translate({w*0.12:.1f} {h*0.61:.1f}) rotate(-14)" opacity="0.16">
    <rect x="0" y="0" width="{card_w*0.82:.1f}" height="{card_h*0.82:.1f}" rx="{card_w*0.10:.1f}" fill="#0D294F" stroke="#CFE2F6" stroke-width="{max(1.2, min_dim*0.003):.1f}"/>
  </g>
  <circle cx="{w*0.20:.1f}" cy="{h*0.24:.1f}" r="{dot_r:.1f}" fill="#E2EEFA" opacity="0.55"/>
  <circle cx="{w*0.34:.1f}" cy="{h*0.16:.1f}" r="{dot_r*0.85:.1f}" fill="#9FD0FF" opacity="0.45"/>
  <circle cx="{w*0.66:.1f}" cy="{h*0.64:.1f}" r="{dot_r:.1f}" fill="#FFFFFF" opacity="0.42"/>
{coin_apple_emblem(w * 0.5, h * 0.46, emblem_r)}
</svg>"""
        render_svg_to_png(splash_svg, w, h, False, RES_DIR / rel_path)

    print(f"Rendered {len(ICON_DENSITIES) * 3} icons and {len(SPLASH_SIZES)} splash screens.")


if __name__ == "__main__":
    main()
