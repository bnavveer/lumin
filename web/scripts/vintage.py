"""Give photos a 1970s film-camera look and export web sizes.

    python3 -I web/scripts/vintage.py <in_dir> <out_dir>

For each JPEG/PNG in in_dir, writes <name>-1600.webp, <name>-800.webp and
<name>-1600.jpg to out_dir. The look: lifted (faded) blacks, warm highlights,
slightly cool shadows, lower saturation, red-orange halation around bright
areas, soft lens, vignette and film grain. Uses a fixed seed per file, so
reruns give the same output.
"""

import sys
import zlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

# Per-channel tone curves: (input, output) points, 0–1.
CURVES = {
    0: [(0, 0.075), (0.25, 0.29), (0.5, 0.555), (0.75, 0.80), (1, 0.965)],  # R
    1: [(0, 0.060), (0.25, 0.26), (0.5, 0.515), (0.75, 0.765), (1, 0.935)],  # G
    2: [(0, 0.115), (0.25, 0.265), (0.5, 0.465), (0.75, 0.685), (1, 0.845)],  # B
}
SATURATION = 0.86
HALATION = 0.16
VIGNETTE = 0.30
GRAIN = 0.032
SIZES = (1600, 800)


def apply_curves(a):
    out = np.empty_like(a)
    for c, pts in CURVES.items():
        xs, ys = zip(*pts)
        out[..., c] = np.interp(a[..., c], xs, ys)
    return out


def luminance(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def vintage(img, seed):
    rng = np.random.default_rng(seed)
    img = img.convert("RGB").filter(ImageFilter.GaussianBlur(0.6))  # soft lens
    a = np.asarray(img, dtype=np.float32) / 255
    h, w, _ = a.shape

    # Halation: bright areas bleed a warm glow
    lum = luminance(a)
    hi = np.clip((lum - 0.72) / 0.28, 0, 1)
    glow = Image.fromarray((hi * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(w / 90))
    glow = np.asarray(glow, dtype=np.float32)[..., None] / 255
    a = 1 - (1 - a) * (1 - glow * HALATION * np.array([1.0, 0.42, 0.22]))

    a = apply_curves(a)

    lum = luminance(a)[..., None]
    a = lum + (a - lum) * SATURATION

    # Vignette
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / np.sqrt(2)
    a *= (1 - VIGNETTE * r**2.2)[..., None]

    # Grain: clumpy luminance noise, strongest in the midtones
    small = rng.normal(0, 1, (h // 2 + 1, w // 2 + 1)).astype(np.float32)
    noise = Image.fromarray(small).resize((w, h), Image.BILINEAR)
    noise = np.asarray(noise, dtype=np.float32)
    lum = luminance(a)
    weight = 1 - 0.6 * np.abs(2 * lum - 1) ** 2
    a += (noise * GRAIN * weight)[..., None]

    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))


def main(in_dir, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in in_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    for p in files:
        src = Image.open(p)
        src.thumbnail((2400, 2400))
        big = vintage(src, zlib.crc32(p.stem.encode()))
        for width in SIZES:
            im = big if big.width <= width else big.resize((width, round(big.height * width / big.width)), Image.LANCZOS)
            im.save(out_dir / f"{p.stem}-{width}.webp", quality=80, method=6)
            if width == SIZES[0]:
                im.save(out_dir / f"{p.stem}-{width}.jpg", quality=82, optimize=True, progressive=True)
        print(f"{p.stem}: {big.width}x{big.height}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
