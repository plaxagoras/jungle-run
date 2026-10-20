"""Generate the explorer's body frames into art/frames.txt from one 2D rig.

Run: python3 -I tools/rig.py && python3 -I tools/build.py
Rewrites the block between "# rig begin" and "# rig end". Hand edits there get
overwritten: change the poses here instead. Frames outside the block (sparkles) are
hand-drawn.

The explorer is our own design: a cream bush hat with a wide brim, an orange shirt, a brown
pack, dark trousers and boots. Proportions follow the 1982 jungle-runner idiom (a narrow body
read by its leg pose, flat color, no outline), not any one sprite.

Terminal rules baked in: over the jungle backdrop every 2x4 cell shows the sprite's main color
and the scenery's, so each body part is a flat band that sits on whole cells: hat y 8-11,
face y 12-15, shirt y 16-23 on x 8-11. The run doesn't bob, so the bands never straddle a cell.
lost() prints how many pixels the reduction draws wrong per frame over a plain stage.
"""
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GW, H = 24, 32
HIP = (10.0, 23.0)
THIGH, SHIN = 4.1, 4.1   # reach 8.2 over a 7-px hip-to-ankle drop: standing legs stay nearly straight
UPPER, FORE = 3.3, 3.0
SHOULDER = {'near': 10.0, 'far': 10.5}
TOP = 8                 # hat's top row at bob 0

# Run: 6 frames, 3 per step (contact, pass, lift). Foot (dx from hip, lift): planted for
# frames 0-2, sliding back STEP each frame, then the trailing foot kicks out and comes through.
N = 6
STEP = 4
RUN_FOOT = [(4, 0), (0, 0), (-4, 0), (-7, 3), (-3, 5), (2, 4)]
RUN_SWING = 1.0         # arm swing, radians each way

HEAD = [
    '........PPPP..........',
    '.......PPPPPP.........',
    '.......PPPPPP.........',
    '.....PPPPPPPPPP.......',
    '........FFFFF.........',
    '........FFFFF.........',
    '........FFFF..........',
    '........FFFF..........',
]
TORSO = [
    '........AAAA..........',
    '........AAAA..........',
    '........AAAA..........',
    '........AAAA..........',
    '........AAAA..........',
    '........AAAA..........',
    '........AAAA..........',
]
PACK = [(x, y) for x in range(5, 8) for y in range(17, 22)]


def blank():
    return [['.'] * GW for _ in range(H)]


def put(g, x, y, c):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < GW and 0 <= y < H:
        g[y][x] = c


def line(g, a, b, c, r=0.0):
    """Segment a-b; r > 0 fills every pixel center within r of it."""
    (x0, y0), (x1, y1) = a, b
    if r <= 0:
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            put(g, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c)
        return
    dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy or 1
    for y in range(H):
        for x in range(GW):
            t = max(0, min(1, ((x - x0) * dx + (y - y0) * dy) / L2))
            if math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)) <= r:
                g[y][x] = c


def ik(root, end, l1, l2, bend):
    """(middle joint, reached end) of a 2-bone limb. bend: 'fwd' (+x), 'back' (-x), 'down' (+y)."""
    (rx, ry), (ex, ey) = root, end
    dx, dy = ex - rx, ey - ry
    full = math.hypot(dx, dy) or 0.01
    d = min(full, l1 + l2 - 0.01)
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, l1 * l1 - a * a))
    ux, uy = dx / full, dy / full
    mx, my = rx + ux * a, ry + uy * a
    c1, c2 = (mx - uy * h, my + ux * h), (mx + uy * h, my - ux * h)
    key = {'fwd': lambda p: p[0], 'back': lambda p: -p[0], 'down': lambda p: p[1]}[bend]
    return max(c1, c2, key=key), (rx + ux * d, ry + uy * d)


def leg(g, foot, b, color, drop=0.0, hip=None):
    dx, lift = foot
    hx, hy = hip or HIP
    hip = (hx, hy + b + drop)
    knee, ankle = ik(hip, (hx + dx, 30 - lift), THIGH, SHIN, 'fwd')
    line(g, hip, knee, color, 1.0)
    line(g, knee, ankle, color, 0.75)
    # Boot: a 2-px toe pointing forward, flat on the floor when planted.
    toe = (ankle[0] + 2.0, ankle[1] + (1 if lift == 0 else 0.6 + lift * 0.15))
    line(g, (ankle[0], ankle[1] + (1 if lift == 0 else 0)), toe, 'K')


def arm(g, side, hand, b, sleeve, skin, bend='down', up=False):
    """Arm reaching for `hand` (absolute, at bob 0): a short sleeve, then a bare forearm.
    up: a raised arm, longer and sleeved to the fist so it reads against the face and hat."""
    sh = (SHOULDER[side], 16.5 + b)
    k = 1.25 if up else 1.0
    elbow, got = ik(sh, (hand[0], hand[1] + b), UPPER * k, FORE * k, bend)
    line(g, sh, elbow, sleeve, 0.7)
    line(g, elbow, got, sleeve if up else skin, 0.6)
    put(g, got[0], got[1], skin)
    return got


def swing_hand(side, t):
    """Run arm: bent, swinging opposite its leg (near leg forward at t=0 -> near arm back)."""
    sign = 1 if side == 'near' else -1
    s = -sign * math.cos(2 * math.pi * t / N) * RUN_SWING
    ex, ey = SHOULDER[side] + UPPER * math.sin(s), 16.5 + UPPER * math.cos(s)
    return (ex + FORE * math.sin(s + 1.4), ey + FORE * math.cos(s + 1.4))


def draw(p):
    """One frame from a pose dict; see POSES."""
    g, b = blank(), p['bob']
    hip = p.get('hip')
    arm(g, 'far', p['far_hand'], b, 'A', 'G', p.get('far_bend', 'down'), 'far' in p.get('up', ''))
    leg(g, p['far_foot'], b, 'Z', 1.0, hip)
    for x, y in PACK:
        put(g, x, y + b, 'M')
    for y, row in enumerate(HEAD + TORSO):
        for x, c in enumerate(row):
            if c != '.':
                put(g, x, TOP + y + b, c)
    leg(g, p['near_foot'], b, 'T', 0.0, hip)
    arm(g, 'near', p['near_hand'], b, 'A', 'F', p.get('near_bend', 'down'), 'near' in p.get('up', ''))
    # Props in the hands, drawn last: (x0, y0, x1, y1, color) filled boxes at bob 0.
    for x0, y0, x1, y1, c in p.get('props', []):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                put(g, x, y + b, c)
    w = p.get('width', 18)
    return [''.join(r[:w]) for r in g]


def run(t):
    return {
        'bob': 0,
        'near_foot': RUN_FOOT[t % N],
        'far_foot': RUN_FOOT[(t + N // 2) % N],
        'near_hand': swing_hand('near', t),
        'far_hand': swing_hand('far', t),
    }


# Hands are absolute (x, y) at bob 0. Feet are (dx from hip, lift).
POSES = {
    # Standing: legs together, near arm bent slightly forward. idle2 shifts the hands a pixel.
    'idle': dict(bob=0, near_foot=(1, 0), far_foot=(-1, 0), near_hand=(13, 21), far_hand=(12, 22)),
    'idle2': dict(bob=0, near_foot=(1, 0), far_foot=(-1, 0), near_hand=(13, 22), far_hand=(12, 22.5)),
    # Jump: crouch, launch, then upright with the legs together and bent down (air1, air2),
    # legs reaching for the ground (fall), and the landing squash.
    'tuck': dict(bob=2, near_foot=(2, 0), far_foot=(-1, 0), near_hand=(13, 21), far_hand=(7, 20)),
    'launch': dict(bob=-1, near_foot=(1, 0), far_foot=(-2, 2), near_hand=(14, 13), far_hand=(13, 14),
                   near_bend='fwd', far_bend='fwd'),
    'air1': dict(bob=-1, near_foot=(-1, 4), far_foot=(-2, 4), near_hand=(14, 16), far_hand=(7, 18)),
    'air2': dict(bob=0, near_foot=(0, 3), far_foot=(-1, 3), near_hand=(14, 17), far_hand=(7, 19)),
    'fall': dict(bob=0, near_foot=(3, 2), far_foot=(-2, 1), near_hand=(14, 15), far_hand=(7, 15)),
    'land': dict(bob=2, near_foot=(3, 0), far_foot=(-3, 0), near_hand=(14, 20), far_hand=(13, 20)),
    # Vine hang: the near fist up at the vine (HANG_HAND in hooks/jungle.ts), the far hand just
    # under it, thighs forward and shins thrown out level; hang2 lets them swing down a little.
    'hang1': dict(bob=0, near_foot=(8, 6), far_foot=(7, 7), near_hand=(12, 9.5), far_hand=(12, 11),
                  near_bend='fwd', far_bend='fwd'),
    'hang2': dict(bob=0, near_foot=(7, 4), far_foot=(6, 5), near_hand=(12, 9.5), far_hand=(12, 11),
                  near_bend='fwd', far_bend='fwd'),
    # Camp: sat on the ground, knees up, forearms on the knees.
    'sit': dict(bob=6, near_foot=(6, 0), far_foot=(5, 0), near_hand=(14, 20), far_hand=(13, 20)),
    # Camp bits (hooks/idle.ts). A wave: the near arm up, the fist rocking out and back.
    'wave1': dict(bob=0, near_foot=(1, 0), far_foot=(-1, 0), near_hand=(15, 9), far_hand=(12, 22),
                  near_bend='fwd', up='near'),
    'wave2': dict(bob=0, near_foot=(1, 0), far_foot=(-1, 0), near_hand=(17, 10.5), far_hand=(12, 22),
                  near_bend='down', up='near', width=20),
    # Wiping his brow under the hat brim.
    'brow': dict(bob=0, near_foot=(1, 0), far_foot=(-1, 0), near_hand=(12, 13), far_hand=(12, 22),
                 near_bend='fwd'),
    # Reading a map held open at chest height, a cell-aligned block (x 12-15, y 16-19).
    'map': dict(bob=0, near_foot=(1, 0), far_foot=(-1, 0), near_hand=(14, 20), far_hand=(13, 20),
                props=[(12, 16, 15, 19, 'P')]),
    # Sat at the fire, poking it with a stick.
    'poke': dict(bob=6, near_foot=(6, 0), far_foot=(5, 0), near_hand=(15, 19), far_hand=(13, 20),
                 near_bend='fwd', props=[(16, 25, 17, 25, 'M'), (18, 26, 19, 26, 'M')], width=20),
    # A treasure held up in the near fist (the treasure itself is an fx sprite over it).
    'cheer': dict(bob=0, near_foot=(2, 0), far_foot=(-2, 0), near_hand=(15, 9), far_hand=(12, 22),
                  near_bend='fwd', up='near'),
}


def lost(rows):
    """Pixels the terminal's two-colors-per-cell reduction draws wrong."""
    sys.path.insert(0, str(ROOT / 'tools'))
    from build import cells
    rows = ['.' * len(rows[0])] * (H - len(rows)) + rows
    bad = 0
    for cy, ln in enumerate(cells(rows)):
        for cx, (m, fg, bg) in enumerate(ln):
            for i in range(8):
                x, y = cx * 2 + i % 2, cy * 4 + i // 2
                want = rows[y][x] if x < len(rows[0]) else '.'
                bad += want != ((fg if m >> i & 1 else bg) or '.')
    return bad


def main():
    frames = {**{f'run{t + 1}': draw(run(t)) for t in range(N)}, **{n: draw(p) for n, p in POSES.items()}}
    p = ROOT / 'art' / 'frames.txt'
    head, rest = p.read_text().split('# rig begin')
    _, tail = rest.split('# rig end')
    tail = tail.split('\n', 1)[1] if '\n' in tail else ''
    blocks = []
    for name, rows in frames.items():
        while rows and not rows[0].strip('.'):
            rows.pop(0)
        blocks.append(f'= {name}\n' + '\n'.join(rows))
        print(f'{name}: {lost(rows)} px lost in the terminal')
    p.write_text(head + '# rig begin (generated by tools/rig.py; edit the rig, not these rows)\n\n'
                 + '\n\n'.join(blocks) + '\n\n# rig end\n' + tail)


main()
