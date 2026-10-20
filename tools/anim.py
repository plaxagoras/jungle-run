"""Animated preview of a loop as the terminal will draw it: art/<name>.gif.

Run: python3 -I tools/anim.py [frame-prefix] [px-per-tick]   (default: run 4)
Left strip: true pixels in place. Right: octant reduction, travelling at px-per-tick over a
floor with tick marks, so foot slide shows up as a foot creeping against the marks.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import H, PALETTE, ROOT, cells, parse
from PIL import Image, ImageDraw

prefix = sys.argv[1] if len(sys.argv) > 1 else 'run'
speed = int(sys.argv[2]) if len(sys.argv) > 2 else 4
src = Path(sys.argv[3]) if len(sys.argv) > 3 else ROOT / 'art' / 'frames.txt'
frames = parse(src.read_text())
loop = sorted((n for n in frames if n.startswith(prefix) and n[len(prefix):].isdigit()), key=lambda n: int(n[len(prefix):]))
S, STAGE = 8, 120
out = []
for k in range(len(loop) * 4):
    rows = frames[loop[k % len(loop)]]
    w = len(rows[0])
    img = Image.new('RGB', ((w + 4 + STAGE) * S, (H + 2) * S), '#14161f')
    d = ImageDraw.Draw(img)
    def px(x, y, c):
        d.rectangle([x * S, y * S, x * S + S - 1, y * S + S - 1], fill=c)
    for y, r in enumerate(rows):
        for x, p in enumerate(r):
            if p != '.':
                px(x, y, PALETTE[p])
    ox = w + 4 + (k * speed) % (STAGE - w)
    ox -= ox % 2
    for gx in range(w + 4, w + 4 + STAGE, 8):
        px(gx, H, '#3a3f55')
    for cy, line in enumerate(cells(rows)):
        for cx, (mask, fg, bg) in enumerate(line):
            for i in range(8):
                on = mask >> i & 1
                col = PALETTE[fg] if on and fg else (PALETTE[bg] if bg else None)
                if col:
                    px(ox + cx * 2 + i % 2, cy * 4 + i // 2, col)
    out.append(img)
dest = Path(sys.argv[4]) if len(sys.argv) > 4 else ROOT / 'art' / f'{prefix}.gif'
out[0].save(dest, save_all=True, append_images=out[1:], duration=120, loop=0)
# Contact sheet of one cycle for quick reading.
sheet = Image.new('RGB', (out[0].width, out[0].height * len(loop)), '#000')
for i in range(len(loop)):
    sheet.paste(out[i], (0, i * out[0].height))
sheet.save(ROOT / 'art' / f'{prefix}-sheet.png')
print(dest, len(loop), 'frames')
