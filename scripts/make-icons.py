#!/usr/bin/env python3
"""Draws the Week One mark and writes the app's icon set.

There is no image tooling on the build machine — no Pillow, no ImageMagick,
no librsvg — so this rasterises the mark itself and encodes the PNG by hand.
It is deterministic: running it again produces byte-identical files, so the
icons can be regenerated from source rather than kept as binaries nobody can
edit.

The mark is 'Trace': six weeks as equal bars, the seventh standing as the stem
of a 1, and the numeral's head carrying on in a second colour back to the first
bar — which is drawn in that same colour, because that is where it came from.
"""

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

# The app's own tokens (src/theme/tokens.ts).
PAPER_LIGHT = (0xE9, 0xEC, 0xEE)
PAPER_DARK = (0x0B, 0x10, 0x15)
ACCENT_LIGHT = (0x1F, 0x3E, 0x9E)
ACCENT_DARK = (0x8A, 0xA1, 0xFF)
HIT_LIGHT = (0x2C, 0x6E, 0x54)
HIT_DARK = (0x5D, 0xBC, 0x91)

SS = 3  # supersampling factor, for antialiasing


# ---------------------------------------------------------------- geometry

def rounded_rect(x, y, w, h, r):
    """A shape test for a rounded rectangle, in the mark's 100x100 space."""
    x0, y0, x1, y1 = x, y, x + w, y + h
    r = min(r, w / 2, h / 2)

    def inside(px, py):
        if px < x0 or px > x1 or py < y0 or py > y1:
            return False
        cx = min(max(px, x0 + r), x1 - r)
        cy = min(max(py, y0 + r), y1 - r)
        return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
    inside.box = (x0, y0, x1, y1)
    return inside


def _bezier(p0, p1, p2, p3, steps=160):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0]
        y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
        pts.append((x, y))
    return pts


def _dist_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def polyline(points, width):
    """A round-capped, round-joined stroke through the given points."""
    half = width / 2
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    bx0, bx1 = min(xs) - half, max(xs) + half
    by0, by1 = min(ys) - half, max(ys) + half

    def inside(px, py):
        if px < bx0 or px > bx1 or py < by0 or py > by1:
            return False
        for i in range(len(points) - 1):
            ax, ay = points[i]
            bx, by = points[i + 1]
            if _dist_to_segment(px, py, ax, ay, bx, by) <= half:
                return True
        return False
    inside.box = (bx0, by0, bx1, by1)
    return inside


def mark_shapes():
    """The Trace mark, as (shape, ink) pairs painted in order.

    ink is 'one' for the numeral, 'trace' for the line back to week one,
    and 'faint' for the weeks in between.
    """
    out = []

    # The five weeks between, equal and held back.
    for x in (15.5, 30.5, 45.5, 60.5, 75.5):
        out.append((rounded_rect(x, 71, 9, 13, 2.5), "faint"))

    # The trace: the numeral's head, carrying on and flattening back to week one.
    # Kept lighter than the numeral so the 1 stays the thing you see first.
    tail = _bezier((5, 67), (38, 65.5), (64, 60), (83, 27))
    out.append((polyline(tail, 6.5), "trace"))

    # Week one, in the trace's own colour: this is where the line lands.
    out.append((rounded_rect(0.5, 67, 9, 17, 2.5), "trace"))

    # The numeral: a short head, a stem heavy enough to carry it, and a foot.
    out.append((polyline([(83, 27), (94, 9.5)], 10.5), "one"))
    out.append((rounded_rect(88.5, 8, 11, 76, 3), "one"))
    out.append((rounded_rect(0.5, 89, 99, 7, 3.5), "one"))
    return out


# ---------------------------------------------------------------- raster

def render(size, ground, ink_one, ink_trace, pad=0.16, faint=0.32):
    """Paints the mark centred on a solid ground, supersampled then averaged."""
    shapes = mark_shapes()
    big = size * SS

    span = big * (1 - 2 * pad)
    off = big * pad
    scale = span / 100.0
    # The drawn mark spans y=8 (stem top) to y=96 (foot bottom) in its own
    # field, not the full 0..100 — centre on what is actually there, or it
    # hangs high in the frame.
    voff = off + (span - 88 * scale) / 2 - 8 * scale

    inks = {
        "one": ink_one,
        "trace": ink_trace,
        "faint": tuple(
            round(g + (c - g) * faint) for c, g in zip(ink_one, ground)
        ),
    }

    painted = [(sh, inks[name], sh.box) for sh, name in shapes]
    sums = [[[0, 0, 0] for _ in range(size)] for _ in range(size)]
    per = SS * SS

    for by in range(big):
        gy = (by + 0.5 - voff) / scale
        # Only the shapes this row can actually touch.
        row = [(sh, ink, box) for sh, ink, box in painted if box[1] <= gy <= box[3]]
        oy = by // SS
        srow = sums[oy]
        if not row:
            for ox in range(size):
                s = srow[ox]
                s[0] += ground[0] * SS
                s[1] += ground[1] * SS
                s[2] += ground[2] * SS
            continue
        for bx in range(big):
            gx = (bx + 0.5 - off) / scale
            colour = ground
            for sh, ink, box in row:
                if box[0] <= gx <= box[2] and sh(gx, gy):
                    colour = ink
            s = srow[bx // SS]
            s[0] += colour[0]
            s[1] += colour[1]
            s[2] += colour[2]

    return [[[c // per for c in s] for s in srow] for srow in sums]


def write_png(path, pixels, alpha=False):
    h = len(pixels)
    w = len(pixels[0])
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type 0
        for px in row:
            raw.extend(px[:4] if alpha else px[:3])

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6 if alpha else 2, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)
    return len(png)


def with_alpha(pixels, ground):
    """Turns the ground transparent, for the Android foreground layer."""
    out = []
    for row in pixels:
        r = []
        for px in row:
            if abs(px[0] - ground[0]) + abs(px[1] - ground[1]) + abs(px[2] - ground[2]) < 12:
                r.append([px[0], px[1], px[2], 0])
            else:
                r.append([px[0], px[1], px[2], 255])
        out.append(r)
    return out


def flat(size, colour):
    return [[list(colour) for _ in range(size)] for _ in range(size)]


def main():
    jobs = []

    # iOS icon: the app's dark palette, where both inks are at their brightest.
    icon = render(1024, PAPER_DARK, ACCENT_DARK, HIT_DARK, pad=0.17, faint=0.46)
    jobs.append(("icon.png", icon, False))

    # Splash: the mark alone, transparent, so it sits on either ground.
    splash = render(512, PAPER_DARK, ACCENT_DARK, HIT_DARK, pad=0.1, faint=0.46)
    jobs.append(("splash-icon.png", with_alpha(splash, PAPER_DARK), True))

    # Android adaptive layers.
    fg = render(1024, PAPER_LIGHT, ACCENT_LIGHT, HIT_LIGHT, pad=0.28)
    jobs.append(("android-icon-foreground.png", with_alpha(fg, PAPER_LIGHT), True))
    jobs.append(("android-icon-background.png", flat(1024, PAPER_LIGHT), False))
    mono = render(1024, (0xFF, 0xFF, 0xFF), (0, 0, 0), (0, 0, 0), pad=0.28)
    jobs.append(("android-icon-monochrome.png", with_alpha(mono, (0xFF, 0xFF, 0xFF)), True))

    # Web favicon.
    fav = render(96, PAPER_DARK, ACCENT_DARK, HIT_DARK, pad=0.08, faint=0.5)
    jobs.append(("favicon.png", fav, False))

    for name, pixels, alpha in jobs:
        n = write_png(ASSETS / name, pixels, alpha)
        print(f"{name:34s} {len(pixels[0]):>5}px  {n/1024:7.1f} KB")


if __name__ == "__main__":
    main()
