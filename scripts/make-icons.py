#!/usr/bin/env python3
"""Render every Birdsongs icon from src/ui/icon-art.json.

The foreground (bird, note, moon, stars) comes from the JSON; the dusk sky,
hills and wire are procedural so the art can be padded for maskable/apple
icons without stretching. Every size is an integer multiple of the art grid,
so pixels stay perfectly square.

    python3 scripts/make-icons.py
"""
import json
import math
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = json.load(open(os.path.join(ROOT, 'src/ui/icon-art.json')))
COLORS = ART['colors']
SKY = ['#1a1636', '#2a2150', '#44306a', '#6e3d78', '#a2486f', '#d65f63', '#f2865c', '#ffb56b', '#ffc98a']
HILLS = '#1d1830'
WIRE = '#120f1f'


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def hill_top(x, unit):
    # same formula as src/ui/live-icon.js
    return round((27 + math.sin(x * 0.42) * 1.3 + math.sin(x * 0.19 + 1) * 0.9) * unit)


def background(x, y, art):
    """Colour of art cell (x, y); x/y may lie outside the art when padding."""
    unit = art['size'] / 32
    if y >= hill_top(x / unit, 1) * unit:
        return HILLS
    if y == art['wire']:
        return WIRE
    band_h = 3 * unit
    band = max(0, min(len(SKY) - 1, math.floor(y / band_h)))
    # dither the first row of each band into the one above
    if band > 0 and y % band_h < 1 and (x + y) % 2 == 0:
        band -= 1
    return SKY[band]


def render(art, pad, cell):
    n = art['size'] + 2 * pad
    img = Image.new('RGB', (n * cell, n * cell))
    px = img.load()
    for gy in range(n):
        for gx in range(n):
            x, y = gx - pad, gy - pad
            ch = art['rows'][y][x] if 0 <= x < art['size'] and 0 <= y < art['size'] else '.'
            col = hexrgb(COLORS[ch] if ch != '.' else background(x, y, art))
            for dy in range(cell):
                for dx in range(cell):
                    px[gx * cell + dx, gy * cell + dy] = col
    return img


def svg(art):
    n = art['size']
    rects = []
    for y in range(n):
        x = 0
        while x < n:
            ch = art['rows'][y][x]
            col = COLORS[ch] if ch != '.' else background(x, y, art)
            run = 1
            while x + run < n:
                c2 = art['rows'][y][x + run]
                if (COLORS[c2] if c2 != '.' else background(x + run, y, art)) != col:
                    break
                run += 1
            rects.append(f'<rect x="{x}" y="{y}" width="{run}" height="1" fill="{col}"/>')
            x += run
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" shape-rendering="crispEdges">'
            + ''.join(rects) + '</svg>\n')


def main():
    big, small = ART['big'], ART['small']
    pub = os.path.join(ROOT, 'public')
    os.makedirs(os.path.join(pub, 'icons'), exist_ok=True)
    out = {
        'icons/icon-192.png': render(big, 0, 6),
        'icons/icon-512.png': render(big, 0, 16),
        # maskable: art inside the 80% safe circle (40-cell canvas, 4 cells of sky each side)
        'icons/maskable-480.png': render(big, 4, 12),
        'icons/maskable-200.png': render(big, 4, 5),
        # iOS rounds the corners itself; 2 cells of breathing room
        'apple-touch-icon.png': render(big, 2, 5),
    }
    for name, img in out.items():
        img.save(os.path.join(pub, name), optimize=True)
    ico = [render(small, 0, 1), render(big, 0, 1), render(small, 0, 3)]
    ico[1].save(os.path.join(pub, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)], append_images=[ico[0], ico[2]])
    open(os.path.join(pub, 'favicon.svg'), 'w').write(svg(big))
    print('icons written:', ', '.join(list(out) + ['favicon.ico', 'favicon.svg']))


if __name__ == '__main__':
    main()
