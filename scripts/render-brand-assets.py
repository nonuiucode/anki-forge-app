#!/usr/bin/env python3
"""Render Android launcher icons, adaptive foregrounds, background color, and splash PNGs from master artwork."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps

REPO_ROOT = Path(__file__).resolve().parent.parent
BRAND_DIR = REPO_ROOT / "scripts" / "brand-sources"
RES_DIR = REPO_ROOT / "android" / "app" / "src" / "main" / "res"

APP_ICON_SRC = BRAND_DIR / "app-icon-source.png"
HERO_DARK_SRC = BRAND_DIR / "hero-dark-source.png"
LAUNCHER_BG_XML = RES_DIR / "values" / "ic_launcher_background.xml"

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


def compute_edge_hex(im: Image.Image) -> str:
    """Compute average hex color along the outer border of the master icon."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    band = max(2, min(w, h) // 50)
    r_sum = g_sum = b_sum = count = 0

    for y in range(h):
        if y < band or y >= h - band:
            xs = range(w)
        else:
            xs = list(range(band)) + list(range(w - band, w))
        for x in xs:
            r, g, b = px[x, y]
            r_sum += r
            g_sum += g
            b_sum += b
            count += 1

    r_avg = round(r_sum / count)
    g_avg = round(g_sum / count)
    b_avg = round(b_sum / count)
    return f"#{r_avg:02X}{g_avg:02X}{b_avg:02X}"


def write_launcher_bg_xml(hex_color: str) -> None:
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        f'    <color name="ic_launcher_background">{hex_color}</color>\n'
        "</resources>\n"
    )
    LAUNCHER_BG_XML.parent.mkdir(parents=True, exist_ok=True)
    LAUNCHER_BG_XML.write_text(xml, encoding="utf-8")


def make_rounded_mask(size: int, radius: float, supersample: int = 4) -> Image.Image:
    big = size * supersample
    mask = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(mask)
    inset = max(1, round(supersample * 0.5))
    draw.rounded_rectangle(
        [inset, inset, big - 1 - inset, big - 1 - inset],
        radius=radius * supersample,
        fill=255,
    )
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def make_circle_mask(size: int, supersample: int = 4) -> Image.Image:
    big = size * supersample
    mask = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(mask)
    inset = max(1, round(supersample * 0.5))
    draw.ellipse([inset, inset, big - 1 - inset, big - 1 - inset], fill=255)
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def apply_mask_rgba(src: Image.Image, size: int, mask: Image.Image) -> Image.Image:
    rgba = src.resize((size, size), Image.Resampling.LANCZOS).convert("RGBA")
    rgba.putalpha(mask)
    return rgba


def crop_medallion_square(app_im: Image.Image) -> Image.Image:
    """Crop square tightly framing the centered brushed-silver medallion."""
    w, h = app_im.size
    # Medallion sits centered at (~50%, ~49.3%) with radius ~24.5% of canvas width.
    cx = w * 0.499
    cy = h * 0.493
    half = w * 0.244
    box = (
        max(0, round(cx - half)),
        max(0, round(cy - half)),
        min(w, round(cx + half)),
        min(h, round(cy + half)),
    )
    return app_im.crop(box)


def build_vignette_overlay(w: int, h: int, strength: float = 0.42) -> Image.Image:
    """Create a subtle dark radial vignette at low resolution then smoothly upscale."""
    vw, vh = 160, max(90, round(160 * h / w))
    ov = Image.new("RGBA", (vw, vh), (0, 0, 0, 0))
    px = ov.load()
    cx, cy = (vw - 1) / 2.0, (vh - 1) / 2.0
    max_d = math.hypot(cx, cy)
    for y in range(vh):
        dy = (y - cy) / max_d
        for x in range(vw):
            dx = (x - cx) / max_d
            dist = math.hypot(dx, dy)
            t = max(0.0, min(1.0, (dist - 0.35) / 0.65))
            alpha = round(255 * strength * (t * t))
            px[x, y] = (4, 10, 22, alpha)
    return ov.resize((w, h), Image.Resampling.BICUBIC)


def render_medallion_badge(medallion_sq: Image.Image, diameter: int) -> Image.Image:
    """Render circular-framed medallion with soft drop shadow and subtle #DCE8F5 ring."""
    ss = 4
    pad = max(8, round(diameter * 0.14))
    canvas_size = diameter + pad * 2
    big_d = diameter * ss
    big_pad = pad * ss
    big_canvas = canvas_size * ss

    # Soft shadow behind medallion
    shadow = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_off = max(2, round(diameter * 0.025))
    s_draw.ellipse(
        [pad, pad + s_off, pad + diameter, pad + diameter + s_off],
        fill=(3, 8, 18, 130),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(3.0, diameter * 0.055)))

    # Supersampled circular medallion + crisp #DCE8F5 ring
    ring_px = max(2, round(diameter * 0.014)) * ss
    inner_d = big_d - ring_px * 2

    badge_big = Image.new("RGBA", (big_canvas, big_canvas), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(badge_big)
    b_draw.ellipse(
        [big_pad, big_pad, big_pad + big_d - 1, big_pad + big_d - 1],
        fill=(220, 232, 245, 220),
    )

    inner_img = medallion_sq.resize((inner_d, inner_d), Image.Resampling.LANCZOS).convert("RGBA")
    inner_mask = Image.new("L", (inner_d, inner_d), 0)
    ImageDraw.Draw(inner_mask).ellipse([0, 0, inner_d - 1, inner_d - 1], fill=255)
    badge_big.paste(inner_img, (big_pad + ring_px, big_pad + ring_px), inner_mask)

    badge = badge_big.resize((canvas_size, canvas_size), Image.Resampling.LANCZOS)
    return Image.alpha_composite(shadow, badge)


def save_optimized_png(im: Image.Image, out_path: Path, quantize: bool = False) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if quantize:
        # Adaptive 256-color palette keeps high-res splash screens crisp and compact.
        pal = im.convert("RGB").quantize(
            colors=256,
            method=Image.Quantize.FASTOCTREE,
            dither=Image.Dither.FLOYDSTEINBERG,
        )
        pal.save(out_path, format="PNG", optimize=True)
    else:
        im.save(out_path, format="PNG", optimize=True)


def main() -> None:
    if not APP_ICON_SRC.exists() or not HERO_DARK_SRC.exists():
        raise FileNotFoundError(
            f"Missing brand sources in {BRAND_DIR}; expected {APP_ICON_SRC.name} and {HERO_DARK_SRC.name}."
        )

    app_src = Image.open(APP_ICON_SRC).convert("RGB")
    hero_src = Image.open(HERO_DARK_SRC).convert("RGB")
    medallion_sq = crop_medallion_square(app_src)

    edge_hex = compute_edge_hex(app_src)
    write_launcher_bg_xml(edge_hex)

    # 1. Android launcher icons (all 5 densities)
    for density, (icon_px, fg_px) in ICON_DENSITIES.items():
        mip_dir = RES_DIR / f"mipmap-{density}"

        # Adaptive foreground: full-bleed smooth LANCZOS resize
        fg = app_src.resize((fg_px, fg_px), Image.Resampling.LANCZOS).convert("RGBA")
        save_optimized_png(fg, mip_dir / "ic_launcher_foreground.png")

        # Legacy rounded-square icon (4x supersampled alpha mask)
        sq_mask = make_rounded_mask(icon_px, radius=icon_px * 0.22, supersample=4)
        sq_icon = apply_mask_rgba(app_src, icon_px, sq_mask)
        save_optimized_png(sq_icon, mip_dir / "ic_launcher.png")

        # Round icon (4x supersampled circular alpha mask)
        rnd_mask = make_circle_mask(icon_px, supersample=4)
        rnd_icon = apply_mask_rgba(app_src, icon_px, rnd_mask)
        save_optimized_png(rnd_icon, mip_dir / "ic_launcher_round.png")

    # 2. Android splash screens (all 11 portrait & landscape sizes)
    for rel_path, (w, h) in SPLASH_SIZES.items():
        # For portrait frames, bias crop toward the calm left-center ocean so no rock edge clips awkwardly.
        center_x = 0.28 if h > w else 0.5
        bg = ImageOps.fit(
            hero_src,
            (w, h),
            method=Image.Resampling.LANCZOS,
            centering=(center_x, 0.5),
        ).convert("RGBA")

        vignette = build_vignette_overlay(w, h, strength=0.44)
        composed = Image.alpha_composite(bg, vignette)

        # Slightly darken center-top area smoothly so medallion reads crisply
        min_dim = min(w, h)
        medallion_d = max(96, round(min_dim * 0.34))
        badge = render_medallion_badge(medallion_sq, medallion_d)
        bx = (w - badge.width) // 2
        by = round(h * 0.46 - badge.height / 2)
        composed.alpha_composite(badge, (bx, by))

        save_optimized_png(composed.convert("RGB"), RES_DIR / rel_path, quantize=True)

    print(
        f"Rendered {len(ICON_DENSITIES) * 3} icons, {len(SPLASH_SIZES)} splash screens, "
        f"and updated ic_launcher_background to {edge_hex}."
    )


if __name__ == "__main__":
    main()
