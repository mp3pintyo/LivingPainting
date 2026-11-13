"""Prepare the painting textures for the game.

    python -I tools/prepare_painting.py

Input : source/paintings/csontvary_vihar_a_nagy_hortobagyon_1903.jpg (Wikimedia Commons, public domain)
Output: game/assets/painting.jpg    the scan itself (bare canvas strip along the bottom edge trimmed)
        game/assets/painting-s.jpg  the same, smaller (phones)
        game/assets/sky.jpg         the sky alone: the bridge, the riders on it, the masts and everything below the
                                    horizon filled in from the sky round them (push-pull: a blurred pyramid fill),
                                    so the dome can show it while the 3D bridge and plain stand in front of it
        game/assets/palette.json    colours measured on the scan (linear RGB), for the shaders
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'source', 'paintings', 'csontvary_vihar_a_nagy_hortobagyon_1903.jpg')
OUT = os.path.join(ROOT, 'game', 'assets')
FILL = os.path.join(ROOT, 'source', 'paintings', 'vihar_sky_fill_gpt-image-2.6.png')

TRIM_BOTTOM = 14  # the last rows are the frame's lip
TRIM_SIDES = 4

# Everything that is not sky, in full-scan pixels (the scan is 3429 x 1755).
HORIZON = [(0, 655), (360, 660), (360, 630), (395, 630), (395, 662), (1000, 668), (1255, 668), (1255, 625),
           (1365, 625), (1365, 672), (1500, 676), (1660, 668), (1660, 640), (1740, 640)]
# the top of the bridge's parapet, left to right
PARAPET = [(1745, 628), (1900, 538), (2100, 448), (2500, 312), (2800, 238), (3100, 162), (3429, 78)]
# the riders above the parapet (with the whip) and the galloping horses
RIDERS = [(2105, 95, 2610, 430), (2750, 150, 3040, 300)]


def srgb_to_linear(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def push_pull_fill(img, known):
    """Fill the unknown pixels from the known ones: average down a pyramid, then fill back up."""
    levels = []
    col, w = img * known[..., None], known.astype(np.float32)
    while min(w.shape) > 2:
        levels.append((col, w))
        h2, w2 = col.shape[0] // 2 * 2, col.shape[1] // 2 * 2
        c = col[:h2, :w2].reshape(h2 // 2, 2, w2 // 2, 2, 3).sum(axis=(1, 3))
        ww = w[:h2, :w2].reshape(h2 // 2, 2, w2 // 2, 2).sum(axis=(1, 3))
        col, w = c, ww
    filled = np.where(w[..., None] > 0, col / np.maximum(w[..., None], 1e-6), col.mean(axis=(0, 1)))
    for col, w in reversed(levels):
        h, wd = w.shape
        upc = np.stack([np.array(Image.fromarray(filled[..., k].astype(np.float32)).resize((wd, h), Image.BILINEAR))
                        for k in range(3)], axis=-1)
        own = col / np.maximum(w[..., None], 1e-6)
        a = np.clip(w, 0, 1)[..., None]
        filled = own * a + upc * (1 - a)
    return filled


def main():
    os.makedirs(OUT, exist_ok=True)
    im = Image.open(SRC).convert('RGB')
    W, H = im.size

    # --- the sky mask: 1 = sky we keep
    mask = Image.new('L', (W, H), 255)
    d = ImageDraw.Draw(mask)
    d.polygon(HORIZON + PARAPET + [(W, H), (0, H)], fill=0)
    for r in RIDERS:
        d.rectangle(r, fill=0)
    mask = mask.filter(ImageFilter.MinFilter(25))  # grow the hole a little past every edge
    known = np.array(mask) > 127

    arr = np.array(im).astype(np.float32)
    filled = push_pull_fill(arr, known)
    # where an AI fill of the sky exists (gpt-image edit, see source/paintings/prompts.json) it replaces the blur:
    # only the hole is taken from it, everything kept comes from the scan itself
    if os.path.exists(FILL):
        ai = Image.open(FILL).convert('RGB').resize((W - 2 * TRIM_SIDES, H - TRIM_BOTTOM), Image.LANCZOS)
        filled[:H - TRIM_BOTTOM, TRIM_SIDES:W - TRIM_SIDES] = np.array(ai).astype(np.float32)
        print('sky fill:', os.path.relpath(FILL, ROOT))
    # a soft seam: blend over a few pixels
    soft = np.array(mask.filter(ImageFilter.GaussianBlur(6))).astype(np.float32)[..., None] / 255.0
    sky = arr * soft + filled * (1 - soft)
    # the hole is smooth; give it back a little of the canvas' tooth so it does not read as airbrush
    rng = np.random.default_rng(7)
    grain = rng.normal(0, 3.0, (H, W, 1)).astype(np.float32)
    sky = np.where(known[..., None], sky, sky + grain)

    box = (TRIM_SIDES, 0, W - TRIM_SIDES, H - TRIM_BOTTOM)
    paint = im.crop(box)
    skyim = Image.fromarray(np.clip(sky, 0, 255).astype(np.uint8)).crop(box)
    paint.save(os.path.join(OUT, 'painting.jpg'), quality=90)
    paint.resize((paint.width // 2, paint.height // 2), Image.LANCZOS).save(os.path.join(OUT, 'painting-s.jpg'), quality=88)
    skyim.save(os.path.join(OUT, 'sky.jpg'), quality=90)

    # --- palettes: (x0, y0, x1, y1) regions of the scan, each split into dark → pale bands by luminance
    regions = {
        'storm': (300, 380, 1700, 640),       # the ultramarine wall of the storm
        'cloud': (0, 0, 1500, 300),           # the grey-violet cloud above it
        'sunset': (2000, 0, 3429, 110),       # the clearing: cream, yellow, orange
        'plain': (0, 700, 1600, 930),         # the far plain, pale green
        'grass': (1600, 780, 2050, 950),      # the near bank's bright green
        'water': (150, 1050, 1700, 1300),     # the river
        'brick': (2050, 470, 3400, 640),      # the bridge's pink brick
        'moss': (2150, 1300, 3300, 1450),     # the green on the piers
        'hide': (1260, 1420, 1800, 1580),     # the grey cattle
        'ground': (300, 1620, 2400, 1730),    # the dark foreground
        'road': (1500, 980, 2300, 1060),      # the pale track on the far bank
    }
    pal = {}
    for k, (x0, y0, x1, y1) in regions.items():
        px = srgb_to_linear(arr[y0:y1, x0:x1].reshape(-1, 3))
        lum = px @ np.array([0.2126, 0.7152, 0.0722])
        q = np.quantile(lum, [0, 0.12, 0.35, 0.65, 0.88, 1.0])
        bands = []
        for i in range(5):
            sel = (lum >= q[i]) & (lum <= q[i + 1])
            bands.append([round(float(v), 4) for v in px[sel].mean(axis=0)])
        pal[k] = bands
    with open(os.path.join(OUT, 'palette.json'), 'w') as f:
        json.dump({'horizonV': 680 / (H - TRIM_BOTTOM), 'size': [paint.width, paint.height], 'bands': pal}, f, indent=1)
    print('painting', paint.size, '-> game/assets/{painting,painting-s,sky}.jpg, palette.json')


if __name__ == '__main__':
    main()
