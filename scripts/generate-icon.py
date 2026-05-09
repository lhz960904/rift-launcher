#!/usr/bin/env python3
"""
Generate Rift app icon (.icns) + tray template PNGs from scratch using Pillow.

Run from project root:
    python3 scripts/generate-icon.py

Output:
    build/icon.iconset/  (intermediate)
    build/icon.icns      (consumed by electron-builder)
    build/trayIconTemplate.png    (16x16, base64 it into src/main/index.ts)
    build/trayIconTemplate@2x.png (32x32, ditto)

Design (must stay in sync with src/main/index.ts TRAY_ICON_*):
- App icon: deep-navy squircle (80% of canvas, leaves padding per macOS Big
  Sur spec) + cyan double-halo + top shine + white SF Pro Black "R".
- Tray template: black squircle silhouette + Helvetica Bold "R" cutout
  (alpha-subtract). Will be loaded as nativeImage template image, so macOS
  inverts white/black per menu bar theme.
"""
from PIL import Image, ImageDraw, ImageFont, ImageChops
import math
import os
import subprocess
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD_DIR = os.path.join(PROJECT_ROOT, "build")
ICONSET_DIR = os.path.join(BUILD_DIR, "icon.iconset")

# ---- App icon parameters ----
SQUIRCLE_RATIO = 0.80  # squircle occupies 80% of canvas (macOS Big Sur convention)
BG_TL = (63, 63, 70)        # top-left gradient stop  (#3F3F46)
BG_BR = (10, 10, 15)        # bottom-right gradient stop (#0a0a0f)
SHINE = (255, 255, 255)
HALO_O = (103, 232, 249)    # cyan #67E8F9
HALO_I = (165, 243, 252)    # lighter cyan #A5F3FC


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def squircle_alpha(x, y, w):
    """Superellipse (squircle) coverage at pixel (x,y) inside an w x w canvas."""
    cx = (w - 1) / 2
    dx, dy = (x - cx) / cx, (y - cx) / cx
    n = 5
    d = (abs(dx) ** n + abs(dy) ** n) ** (1 / n)
    edge = 0.97
    if d <= edge:
        return 1.0
    if d >= 1.0:
        return 0.0
    return 1.0 - (d - edge) / (1.0 - edge)


def get_sf_pro_black(size):
    f = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", size)
    f.set_variation_by_name("Black")
    return f


def render_squircle_inner(sq_size):
    """Paint the colored squircle + halo + R into a sq_size x sq_size image."""
    img = Image.new("RGBA", (sq_size, sq_size), (0, 0, 0, 0))
    pixels = img.load()
    cx = (sq_size - 1) / 2
    cy_halo = sq_size * 138 / 256
    halo_outer_r = sq_size * 130 / 256
    halo_inner_r = sq_size * 70 / 256

    for y in range(sq_size):
        for x in range(sq_size):
            sa = squircle_alpha(x, y, sq_size)
            if sa <= 0:
                continue
            # diagonal background gradient
            t_bg = (x + y) / (2 * sq_size)
            r, g, b = lerp(BG_TL, BG_BR, t_bg)
            # top shine
            vy = y / sq_size
            if vy < 0.60:
                r, g, b = lerp((r, g, b), SHINE, 0.10 * (1 - vy / 0.60))
            # halos
            d = math.hypot(x - cx, y - cy_halo)
            if d < halo_outer_r:
                t = d / halo_outer_r
                if t < 0.6:
                    a = 0.55 + (0.18 - 0.55) * (t / 0.6)
                else:
                    a = 0.18 * (1 - (t - 0.6) / 0.4)
                r, g, b = lerp((r, g, b), HALO_O, a)
            if d < halo_inner_r:
                t = d / halo_inner_r
                if t < 0.5:
                    color = lerp(HALO_I, HALO_O, t / 0.5)
                    a = 0.85 + (0.4 - 0.85) * (t / 0.5)
                else:
                    color = HALO_O
                    a = 0.4 * (1 - (t - 0.5) / 0.5)
                r, g, b = lerp((r, g, b), color, a)
            pixels[x, y] = (r, g, b, int(255 * sa))

    # white SF Pro Black "R" centered
    draw = ImageDraw.Draw(img)
    font_size = int(sq_size * 200 / 256)
    font = get_sf_pro_black(font_size)
    bbox = draw.textbbox((0, 0), "R", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (sq_size - tw) / 2 - bbox[0]
    ty = (sq_size - th) / 2 - bbox[1] + sq_size * 6 / 256
    draw.text((tx, ty), "R", font=font, fill=(255, 255, 255, 255))
    return img


def render_app_icon(canvas_size):
    """Render the full canvas with squircle padded inside per macOS spec."""
    sq_size = int(round(canvas_size * SQUIRCLE_RATIO))
    pad = (canvas_size - sq_size) // 2
    sq = render_squircle_inner(sq_size)
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    canvas.paste(sq, (pad, pad), sq)
    return canvas


def render_tray(size):
    """Single-color black squircle (no padding — tray icons fill their frame)
    with Helvetica Bold R cut out via alpha subtract."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rx = max(1, int(round(size * 3.6 / 16)))
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=rx, fill=(0, 0, 0, 255))

    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    font_size = max(6, int(round(size * 11 / 16)))
    font = ImageFont.truetype(
        "/System/Library/Fonts/Helvetica.ttc", font_size, index=1
    )  # index 1 == Bold (verified via getname())
    bbox = md.textbbox((0, 0), "R", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (size - tw) / 2 - bbox[0]
    ty = (size - th) / 2 - bbox[1]
    md.text((tx, ty), "R", font=font, fill=255)

    a = img.split()[3]
    img.putalpha(ImageChops.subtract(a, mask))
    return img


def main():
    os.makedirs(ICONSET_DIR, exist_ok=True)

    print("→ rendering app icon @1024 base...")
    base = render_app_icon(1024)

    iconset_map = {
        16: ["icon_16x16.png"],
        32: ["icon_16x16@2x.png", "icon_32x32.png"],
        64: ["icon_32x32@2x.png"],
        128: ["icon_128x128.png"],
        256: ["icon_128x128@2x.png", "icon_256x256.png"],
        512: ["icon_256x256@2x.png", "icon_512x512.png"],
        1024: ["icon_512x512@2x.png"],
    }
    for s, names in iconset_map.items():
        img_s = base if s == 1024 else base.resize((s, s), Image.LANCZOS)
        for name in names:
            img_s.save(os.path.join(ICONSET_DIR, name))
    print(f"  → wrote {len(sum(iconset_map.values(), []))} sizes to {ICONSET_DIR}")

    print("→ packing iconset → icon.icns via iconutil...")
    out_icns = os.path.join(BUILD_DIR, "icon.icns")
    subprocess.check_call(["iconutil", "-c", "icns", ICONSET_DIR, "-o", out_icns])
    print(f"  → {out_icns} ({os.path.getsize(out_icns) // 1024} KB)")

    print("→ rendering tray template (16/32)...")
    render_tray(16).save(os.path.join(BUILD_DIR, "trayIconTemplate.png"))
    render_tray(32).save(os.path.join(BUILD_DIR, "trayIconTemplate@2x.png"))
    print("  → build/trayIconTemplate{,@2x}.png")

    print(
        "\nNext: copy build/trayIconTemplate{,@2x}.png as base64 into "
        "TRAY_ICON_1X / TRAY_ICON_2X in src/main/index.ts."
    )


if __name__ == "__main__":
    main()
