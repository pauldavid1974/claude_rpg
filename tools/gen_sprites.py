#!/usr/bin/env python3
"""Sprite generator for the RPG.

Draws every sprite in code and writes PNG spritesheets + a manifest.json to
assets/sprites/.  Pure stdlib (zlib PNG writer), no dependencies.

Usage:
    python3 tools/gen_sprites.py            # regenerate everything
    python3 tools/gen_sprites.py player ui  # regenerate only named sheets

Art rules baked in here:
  - One master palette (Endesga 32) for the whole game.
  - Sprites are ASCII grids, one char per pixel, '.' = transparent.
  - Light source: top-left, everywhere.
  - Outlines use '0' (near-black) or a dark shade of the base colour.
"""

import json
import math
import os
import struct
import sys
import zlib

OUT_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "assets", "sprites"))

# ---------------------------------------------------------------------------
# Master palette: Endesga 32.  Keys are the characters used in sprite ASCII.
# Each hue has a shadow/mid/highlight ramp.
# ---------------------------------------------------------------------------
PALETTE = {
    "0": (0x18, 0x14, 0x25),  # outline / near-black
    "1": (0x26, 0x2B, 0x44),  # navy darkest
    "2": (0x3A, 0x44, 0x66),  # slate dark
    "3": (0x5A, 0x69, 0x88),  # slate mid
    "4": (0x8B, 0x9B, 0xB4),  # slate light
    "5": (0xC0, 0xCB, 0xDC),  # silver
    "6": (0xFF, 0xFF, 0xFF),  # white
    "r": (0xE4, 0x3B, 0x44),  # red
    "R": (0xA2, 0x26, 0x33),  # red deep
    "M": (0xFF, 0x00, 0x44),  # hot red (glow)
    "F": (0xF6, 0x75, 0x7A),  # pink (red highlight)
    "o": (0xF7, 0x76, 0x22),  # orange
    "O": (0xBE, 0x4A, 0x2F),  # rust (orange shadow)
    "d": (0xD7, 0x76, 0x43),  # copper (orange mid)
    "y": (0xFE, 0xAE, 0x34),  # gold
    "Y": (0xFE, 0xE7, 0x61),  # gold light
    "g": (0x63, 0xC7, 0x4D),  # green light
    "G": (0x3E, 0x89, 0x48),  # green mid
    "H": (0x26, 0x5C, 0x42),  # green dark
    "D": (0x19, 0x3C, 0x3E),  # green darkest
    "c": (0x2C, 0xE8, 0xF5),  # cyan
    "b": (0x00, 0x99, 0xDB),  # blue
    "B": (0x12, 0x4E, 0x89),  # blue dark
    "p": (0xB5, 0x50, 0x88),  # plum
    "P": (0x68, 0x38, 0x6C),  # purple dark
    "n": (0xE8, 0xB7, 0x96),  # skin light
    "a": (0xE4, 0xA6, 0x72),  # skin mid
    "N": (0xC2, 0x85, 0x69),  # skin dark
    "t": (0xB8, 0x6F, 0x50),  # brown light
    "T": (0x73, 0x3E, 0x39),  # brown dark
    "e": (0x3E, 0x27, 0x31),  # brown darkest
    "E": (0xEA, 0xD4, 0xAA),  # cream / sand
}
TRANSPARENT = "."

# ---------------------------------------------------------------------------
# Frame helpers.  A frame is a list of lists of palette chars.
# ---------------------------------------------------------------------------

def F(*rows, w=16):
    """Parse ASCII rows into a frame, validating size and palette keys."""
    assert len(rows) == w if w != 16 else len(rows) == 16, f"need {w} rows, got {len(rows)}"
    frame = []
    for i, row in enumerate(rows):
        assert len(row) == w, f"row {i} is {len(row)} chars, want {w}: {row!r}"
        for ch in row:
            assert ch == TRANSPARENT or ch in PALETTE, f"unknown colour {ch!r} in row {i}"
        frame.append(list(row))
    return frame


def blank(w=16, h=None):
    h = h or w
    return [[TRANSPARENT] * w for _ in range(h)]


def mirror(frame):
    return [list(reversed(row)) for row in frame]


def recolor(frame, mapping):
    return [[mapping.get(ch, ch) for ch in row] for row in frame]


def flash_white(frame):
    """Hurt variant: everything white, outline kept."""
    return [[ch if ch in (TRANSPARENT, "0") else "6" for ch in row] for row in frame]


def shift(frame, dx, dy):
    w, h = len(frame[0]), len(frame)
    out = blank(w, h)
    for y in range(h):
        for x in range(w):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and frame[y][x] != TRANSPARENT:
                out[ny][nx] = frame[y][x]
    return out


def bob_top(frame, split_row):
    """Idle bob: rows above split_row shift down 1px, legs stay planted."""
    out = [row[:] for row in frame]
    for y in range(split_row, 0, -1):
        out[y] = frame[y - 1][:]
    out[0] = [TRANSPARENT] * len(frame[0])
    return out


def plot(frame, x, y, ch):
    if 0 <= y < len(frame) and 0 <= x < len(frame[0]):
        frame[y][x] = ch


def stamp(frame, other, dx, dy):
    for y, row in enumerate(other):
        for x, ch in enumerate(row):
            if ch != TRANSPARENT:
                plot(frame, x + dx, y + dy, ch)
    return frame


def burst_frames(colors, size=16):
    """Particle death burst: 3 frames of chunks flying outward and fading."""
    frames = []
    cx = cy = size / 2 - 0.5
    stages = [
        (size * 0.14, 7, 2, colors + ["6"]),
        (size * 0.28, 9, 2, colors),
        (size * 0.42, 11, 1, [colors[-1]]),
    ]
    for fi, (rad, n, px, cols) in enumerate(stages):
        f = blank(size, size)
        if fi == 0:  # centre flash
            for oy in range(-1, 2):
                for ox in range(-1, 2):
                    if abs(ox) + abs(oy) < 2:
                        plot(f, int(cx) + ox, int(cy) + oy, "6")
        for i in range(n):
            ang = (i / n) * math.tau + fi * 0.45 + (i * 2.399) % 0.6
            x = int(round(cx + math.cos(ang) * rad))
            y = int(round(cy + math.sin(ang) * rad * 0.9))
            ch = cols[i % len(cols)]
            for oy in range(px):
                for ox in range(px):
                    plot(f, x + ox, y + oy, ch)
        frames.append(f)
    return frames


# ---------------------------------------------------------------------------
# PNG writer (RGBA, no filters).
# ---------------------------------------------------------------------------

def write_png(path, width, height, rgba_rows):
    def chunk(tag, data):
        raw = tag + data
        return struct.pack(">I", len(data)) + raw + struct.pack(">I", zlib.crc32(raw))

    raw = b"".join(b"\x00" + row for row in rgba_rows)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as fh:
        fh.write(png)


# ---------------------------------------------------------------------------
# Sheet assembly.  A sheet is a vertical stack of animation strips.
# ---------------------------------------------------------------------------

class Sheet:
    def __init__(self, name, cell_w, cell_h=None):
        self.name = name
        self.cw = cell_w
        self.ch = cell_h or cell_w
        self.anims = []  # (anim_name, [frames], fps)

    def add(self, name, frames, fps=0):
        if not isinstance(frames, list) or (frames and isinstance(frames[0], list) and frames and isinstance(frames[0][0], str)):
            frames = [frames]
        for f in frames:
            assert len(f) == self.ch and len(f[0]) == self.cw, (
                f"{name}: frame {len(f[0])}x{len(f)} != cell {self.cw}x{self.ch}")
        self.anims.append((name, frames, fps))

    def build(self, manifest):
        cols = max(len(fr) for _, fr, _ in self.anims)
        width = cols * self.cw
        height = len(self.anims) * self.ch
        rows = [bytearray(width * 4) for _ in range(height)]
        for row_i, (name, frames, fps) in enumerate(self.anims):
            for fi, frame in enumerate(frames):
                ox, oy = fi * self.cw, row_i * self.ch
                for y in range(self.ch):
                    for x in range(self.cw):
                        ch = frame[y][x]
                        if ch == TRANSPARENT:
                            continue
                        r, g, b = PALETTE[ch]
                        off = (ox + x) * 4
                        rows[oy + y][off:off + 4] = bytes((r, g, b, 255))
            manifest["anims"][name] = {
                "sheet": self.name, "row": row_i, "frames": len(frames),
                "w": self.cw, "h": self.ch, "fps": fps,
            }
        path = os.path.join(OUT_DIR, self.name + ".png")
        write_png(path, width, height, rows)
        manifest["sheets"][self.name] = {
            "file": self.name + ".png", "cellW": self.cw, "cellH": self.ch,
        }
        return path


# ---------------------------------------------------------------------------
# PLAYER — blue tunic, brown hair, gold buckle.  Feet on row 14.
# ---------------------------------------------------------------------------

def build_player():
    down_stand = F(
        "................",
        ".....000000.....",
        "....0tttttt0....",
        "...0ttttTTTT0...",
        "...0TnnnnnnT0...",
        "...0Tn0nn0nT0...",
        "....0nnnnnn0....",
        "....00naan00....",
        "...0bcbbbbBb0...",
        "...0bbbbbbBb0...",
        "...0n0bbbB0n0...",
        "....0eeyyee0....",
        "....0TT00TT0....",
        "....0TT00TT0....",
        "....0ee00ee0....",
        "................",
    )
    down_step = F(
        "................",
        "................",
        ".....000000.....",
        "....0tttttt0....",
        "...0ttttTTTT0...",
        "...0TnnnnnnT0...",
        "...0Tn0nn0nT0...",
        "....0nnnnnn0....",
        "....00naan00....",
        "...0bcbbbbBb0...",
        "...0n0bbbB0n0...",
        "....0eeyyee0....",
        "....0TT00TT0....",
        "....0ee00TT0....",
        ".........0ee0...",
        "................",
    )
    up_stand = F(
        "................",
        ".....000000.....",
        "....0tttttt0....",
        "...0tttttTTT0...",
        "...0TTTTTTTT0...",
        "...0TTTTTTTT0...",
        "....0TTeeTT0....",
        "....00bbbb00....",
        "...0bcbbbbBb0...",
        "...0bbbbbbBb0...",
        "...0n0bbbB0n0...",
        "....0eeeeee0....",
        "....0TT00TT0....",
        "....0TT00TT0....",
        "....0ee00ee0....",
        "................",
    )
    up_step = F(
        "................",
        "................",
        ".....000000.....",
        "....0tttttt0....",
        "...0tttttTTT0...",
        "...0TTTTTTTT0...",
        "...0TTTTTTTT0...",
        "....0TTeeTT0....",
        "....00bbbb00....",
        "...0bcbbbbBb0...",
        "...0n0bbbB0n0...",
        "....0eeeeee0....",
        "....0TT00TT0....",
        "....0ee00TT0....",
        ".........0ee0...",
        "................",
    )
    right_stand = F(
        "................",
        ".....00000......",
        "....0ttttt0.....",
        "...0ttttttT0....",
        "...0Ttnnnnn0....",
        "...0Ttnn0n0.....",
        "....0nnnnn0.....",
        "....00naa00.....",
        "....0cbbbB0.....",
        "....0bbbbB0.....",
        "....0bn0bB0.....",
        "....0eeyye0.....",
        "....0TT0TT0.....",
        "....0TT0TT0.....",
        "....0ee0ee0.....",
        "................",
    )
    right_a = F(  # stride: legs apart, body bobs down
        "................",
        "................",
        ".....00000......",
        "....0ttttt0.....",
        "...0ttttttT0....",
        "...0Ttnnnnn0....",
        "...0Ttnn0n0.....",
        "....0nnnnn0.....",
        "....00naa00.....",
        "....0cbbbB0.....",
        "....0bbbbB0.....",
        "....0bn0bB0.....",
        "....0eeyye0.....",
        "...0TT00TT0.....",
        "...0ee00ee0.....",
        "................",
    )
    right_b = F(  # stride: front leg reaching
        "................",
        "................",
        ".....00000......",
        "....0ttttt0.....",
        "...0ttttttT0....",
        "...0Ttnnnnn0....",
        "...0Ttnn0n0.....",
        "....0nnnnn0.....",
        "....00naa00.....",
        "....0cbbbB0.....",
        "....0bbbbB0.....",
        "....0bn0bB0.....",
        "....0eeyye0.....",
        "....0TT0TT0.....",
        "....0ee00TT0....",
        "........0ee0....",
    )
    attack_down = F(
        "................",
        ".....000000.....",
        "....0tttttt0....",
        "...0ttttTTTT0...",
        "...0TnnnnnnT0...",
        "...0Tn0nn0nT0...",
        "....0nnnnnn0....",
        "....00naan00....",
        "...0bcbbbb00....",
        "...0n0bbbb0n0...",
        "....0bbbbB0y0...",
        "....0eeyye0650..",
        "....0TT00T0650..",
        "....0TT00T0650..",
        "....0ee00e00500.",
        "................",
    )
    attack_up = F(
        "............65..",
        ".....000000.65..",
        "....0tttttt065..",
        "...0tttttTTT065.",
        "...0TTTTTTTT065.",
        "...0TTTTTTTT0y0.",
        "....0TTeeTT00n0.",
        "....00bbbb00b0..",
        "...0bcbbbbbb0...",
        "...0bbbbbbBb0...",
        "...0n0bbbB00....",
        "....0eeeeee0....",
        "....0TT00TT0....",
        "....0TT00TT0....",
        "....0ee00ee0....",
        "................",
    )
    attack_right = F(
        "................",
        ".....00000......",
        "....0ttttt0.....",
        "...0ttttttT0....",
        "...0Ttnnnnn0....",
        "...0Ttnn0n0.....",
        "....0nnnnn0.....",
        "....00naa00.....",
        "....0cbbbB0.....",
        "....0bbbbbb0000.",
        "....0bbbn0y55560",
        "....0eeyye000000",
        "....0TT0TT0.....",
        "....0TT0TT0.....",
        "....0ee0ee0.....",
        "................",
    )

    s = Sheet("player", 16)
    s.add("player_walk_down", [down_stand, down_step, mirror(down_step)], 8)
    s.add("player_walk_up", [up_stand, up_step, mirror(up_step)], 8)
    s.add("player_walk_right", [right_stand, right_a, right_b], 8)
    s.add("player_walk_left", [mirror(right_stand), mirror(right_a), mirror(right_b)], 8)
    s.add("player_attack_down", [attack_down])
    s.add("player_attack_up", [attack_up])
    s.add("player_attack_right", [attack_right])
    s.add("player_attack_left", [mirror(attack_right)])
    s.add("player_hurt", [flash_white(down_stand)])
    return s


# ---------------------------------------------------------------------------
# NPC villagers — four distinct silhouettes, 2-frame idle bob.
# ---------------------------------------------------------------------------

def build_npcs():
    elder = F(  # stooped, white beard, staff
        "................",
        "....000000......",
        "...05555550.0y0.",
        "..0555555550050.",
        "..05nnnnnn50050.",
        "..05n0nn0n50050.",
        "...05nnnn500050.",
        "...066666650050.",
        "..0T56666555050.",
        "..0Tt566655t050.",
        "..0Ttttt5tttT50.",
        "..0TttttttttT50.",
        "...0TTTTTTTT050.",
        "...0T0....0T0050",
        "...0e0....0e0.0.",
        "................",
    )
    woman = F(  # blonde hair, red dress, cream apron
        "................",
        ".....000000.....",
        "....0yyyyyy0....",
        "...0yyyyyyyy0...",
        "...0ynnnnnny0...",
        "...0yn0nn0ny0...",
        "...0yynnnnyy0...",
        "....00raar00....",
        "...0rFrrrrRr0...",
        "...0nrrrrrRn0...",
        "...0rrEEEErr0...",
        "...0rrEEEERr0...",
        "....0rEEEER0....",
        "....0RRRRRR0....",
        "....0e0..0e0....",
        "................",
    )
    smith = F(  # bald, big beard, grey apron, wide arms
        "................",
        "................",
        ".....000000.....",
        "....0nnnnnn0....",
        "...0nn0nn0nn0...",
        "...0nTTnnTTn0...",
        "...0TTTTTTTT0...",
        "..00T333333T00..",
        ".0nn03444330nn0.",
        ".0nn03444330nn0.",
        ".0nn03444330nn0.",
        "..000333333000..",
        "....03333330....",
        "....0TT00TT0....",
        "....0ee00ee0....",
        "................",
    )
    kid = F(  # small, green cap
        "................",
        "................",
        "................",
        "................",
        ".....000000.....",
        "....0gggggG0....",
        "...0gggggggg0...",
        "....0n0nn0n0....",
        "....0nnnnnn0....",
        "....00gggg00....",
        "...0ngGggGgn0...",
        "....0gggggg0....",
        ".....0T00T0.....",
        ".....0T00T0.....",
        ".....0e00e0.....",
        "................",
    )
    s = Sheet("npcs", 16)
    s.add("npc_elder", [elder, bob_top(elder, 12)], 2)
    s.add("npc_woman", [woman, bob_top(woman, 13)], 2)
    s.add("npc_smith", [smith, bob_top(smith, 12)], 2)
    s.add("npc_kid", [kid, bob_top(kid, 11)], 2)
    return s


# ---------------------------------------------------------------------------
# MONSTERS
# ---------------------------------------------------------------------------

def build_slime():
    a = F(
        "................",
        "................",
        "................",
        "................",
        "................",
        "......0000......",
        "....00gggg00....",
        "...0g66ggggg0...",
        "..0g6gggggggg0..",
        "..0gggggggggG0..",
        ".0gg00g00ggggG0.",
        ".0gg00g00ggggG0.",
        ".0GgggggggggGG0.",
        ".0GGggggggGGGG0.",
        "..00GGGGGGGG00..",
        "................",
    )
    b = F(
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "...00gggggg00...",
        "..0g66ggggggg0..",
        ".0g6ggggggggggG0",
        "0gg00g00gggggGG0",
        "0gg00g00gggggGG0",
        "0GGgggggggggGGG0",
        "00GGGGGGGGGGGG00",
        "................",
    )
    s = Sheet("slime", 16)
    s.add("slime_idle", [a, b], 4)
    s.add("slime_die", burst_frames(["g", "G", "H"]), 12)
    return s


def build_skeleton():
    a = F(
        "................",
        ".....000000.....",
        "....06655550....",
        "...0555555550...",
        "...0500550050...",
        "...0555445550...",
        "....0505050.....",
        ".......040......",
        "...0555555550...",
        "..050055550050..",
        "..040011110040..",
        "..050055550050..",
        ".....055550.....",
        "....050..050....",
        "...0550..0550...",
        "................",
    )
    b = F(
        "................",
        "................",
        ".....000000.....",
        "....06655550....",
        "...0555555550...",
        "...0500550050...",
        "...0555445550...",
        "....0505050.....",
        ".......040......",
        "...0555555550...",
        "..050055550050..",
        "..040011110040..",
        ".....055550.....",
        ".....050050.....",
        "....0550050.....",
        "................",
    )
    s = Sheet("skeleton", 16)
    s.add("skeleton_walk", [a, b], 5)
    s.add("skeleton_die", burst_frames(["5", "4", "3"]), 12)
    return s


def build_bat():
    a = F(
        "................",
        "................",
        "..0..........0..",
        ".0P0........0P0.",
        ".0PP0......0PP0.",
        ".0PPP0....0PPP0.",
        "..0PPP0000PPP0..",
        "...0PPPPPPPP0...",
        "....0pYppYp0....",
        "....0p6pp6p0....",
        ".....0pppp0.....",
        "......0pp0......",
        ".......00.......",
        "................",
        "................",
        "................",
    )
    b = F(
        "................",
        "................",
        "................",
        "................",
        "....00000000....",
        "...0PPPPPPPP0...",
        "..0P0pYppYp0P0..",
        ".0PP0p6pp6p0PP0.",
        ".0P0.0pppp0.0P0.",
        ".00...0pp0...00.",
        ".......00.......",
        "................",
        "................",
        "................",
        "................",
        "................",
    )
    s = Sheet("bat", 16)
    s.add("bat_fly", [a, b], 6)
    s.add("bat_die", burst_frames(["p", "P", "P"]), 12)
    return s


def build_archer():
    body = F(
        "................",
        ".....00000......",
        "....0GHHHH0.....",
        "...0GHHHHHH0....",
        "...0HDggggH0....",
        "...0HDg0g0H0....",
        "....0Dgggg0.....",
        "....0HHHHH00....",
        "...0HHHHHH0n0...",
        "...0HHHHHHHH0...",
        "...0DHHHHHHD0...",
        "....0DDDDDD0....",
        "....0g0..0g0....",
        "....0g0..0g0....",
        "....0e0..0e0....",
        "................",
    )
    # bow: tall copper arc + silver string, held in the right hand
    for x, y, ch in [
        (12, 2, "e"),
        (13, 3, "d"), (13, 4, "d"), (14, 5, "d"), (14, 6, "d"), (14, 7, "d"),
        (14, 8, "d"), (14, 9, "d"), (13, 10, "d"), (13, 11, "d"),
        (12, 12, "e"),
        (12, 3, "5"), (12, 4, "5"), (12, 5, "5"), (12, 6, "5"),
        (12, 9, "5"), (12, 10, "5"), (12, 11, "5"),
    ]:
        plot(body, x, y, ch)
    s = Sheet("archer", 16)
    s.add("archer_idle", [body, bob_top(body, 11)], 3)
    s.add("archer_die", burst_frames(["H", "g", "D"]), 12)
    return s


def build_brute():
    body = F(
        "...........0000.",
        "..........0tttT0",
        "..00000...0tttT0",
        ".0ggggg0..0tttT0",
        ".0g0gg0g0.0tttT0",
        ".0ggggggg0.0tT0.",
        ".0g6gg6gg0.0tT0.",
        ".00ggggg00.0tT0.",
        "0gg0ggggg000tT0.",
        "0gg0gggggg0ntT0.",
        "0gg0gGGggg00tT0.",
        ".00.0TTTT0.0tT0.",
        "....0gg00gg00e0.",
        "....0gg00gg0....",
        "....0ee00ee0....",
        "................",
    )
    s = Sheet("brute", 16)
    s.add("brute_walk", [body, bob_top(body, 11)], 3)
    s.add("brute_die", burst_frames(["g", "G", "T"]), 12)
    return s


def build_boss():
    core = lambda f14: "....0PP00" + f14 + "00PP0...."  # cape strips flank the torso
    body = F(
        "......00................00......",
        ".....0EE0..............0EE0.....",
        "....0EEE0..............0EEE0....",
        "....0EEE0....000000....0EEE0....",
        ".....0EE0..0444444330..0EE0.....",
        "......0E0.044444433330.0E0......",
        ".........05444444333320.........",
        ".........03444444333320.........",
        ".........034MM433MM4320.........",
        ".........03444433444320.........",
        ".........02333333333320.........",
        "..........002222222200..........",
        "....000044444444444444440000....",
        "...05444444433333333334444430...",
        "...04444444033333333044444430...",
        core("44333333333222"),
        core("433333yy333222"),
        core("43333yyyy33222"),
        core("433333yy333222"),
        core("43333333333222"),
        core("222222yy222222"),
        core("34334334334332"),
        "........0033333333333300........",
        ".........034320..034320.........",
        ".........034320..034320.........",
        ".........034320..034320.........",
        ".........023220..023220.........",
        ".........034320..034320.........",
        ".........034320..034320.........",
        ".......03333200..00333320.......",
        ".......00000000..00000000.......",
        "................................",
        w=32,
    )
    return body


def build_boss_sheet():
    body = build_boss()

    def with_sword_side(base):
        f = [row[:] for row in base]
        for y in range(7, 25):
            plot(f, 27, y, "6" if y < 13 else "5")
            plot(f, 28, y, "5" if y < 13 else "4")
        plot(f, 27, 6, "0")
        plot(f, 28, 6, "0")
        for x in range(25, 31):  # crossguard
            plot(f, x, 25, "y")
        plot(f, 27, 26, "y")
        plot(f, 28, 26, "y")
        plot(f, 27, 27, "T")
        plot(f, 28, 27, "T")
        plot(f, 27, 28, "y")
        plot(f, 28, 28, "y")
        return f

    def with_sword_raised(base):
        f = [row[:] for row in base]
        for i in range(14):  # diagonal blade up-right from the shoulder
            x, y = 24 + i // 2, 12 - i
            plot(f, x, y, "5")
            plot(f, x - 1, y, "6")
        for x in range(23, 27):
            plot(f, x, 13, "y")
        return f

    idle_a = with_sword_side(body)
    idle_b = with_sword_side(bob_top(body, 23))
    attack = with_sword_raised(body)
    s = Sheet("boss", 32)
    s.add("boss_idle", [idle_a, idle_b], 3)
    s.add("boss_attack", [attack])
    s.add("boss_die", burst_frames(["4", "3", "P"], 32), 12)
    return s


# ---------------------------------------------------------------------------
# TERRAIN — programmatic tiles, all designed to tile seamlessly.
# ---------------------------------------------------------------------------
import random

WAVE = [2, 2, 3, 2, 2, 3, 3, 2, 2, 3, 2, 2, 3, 3, 2, 2]  # shared edge wobble


def tile_fill(ch):
    return [[ch] * 16 for _ in range(16)]


def grass_tile(seed, flowers=False):
    """Grass with clumped value variation.

    All the noise comes from waves whose period divides 16, so the tile is
    seamless against copies of itself in every direction.
    """
    rnd = random.Random(seed)
    t = tile_fill("G")
    ph = seed * 1.7
    for y in range(16):
        for x in range(16):
            v = (math.sin((x + ph) * math.pi / 8) * math.cos((y + ph * 2) * math.pi / 8)
                 + 0.55 * math.sin((2 * x + 3 * y + ph) * math.pi / 8)
                 + 0.35 * math.cos((3 * x - 2 * y + ph * 3) * math.pi / 8))
            if v > 1.05:
                t[y][x] = "g"      # sunlit clump
            elif v < -1.05:
                t[y][x] = "H"      # shaded clump
    for _ in range(7):             # blade tufts catching the light
        x, y = rnd.randrange(16), rnd.randrange(2, 16)
        t[y][x] = "g"
        t[y - 1][x] = "g"
        if rnd.random() < 0.5:
            t[y - 1][(x + 1) % 16] = "g"
    if flowers:
        for fx, fy, col in [(4, 4, "Y"), (11, 10, "6")]:
            t[fy][fx] = col
            for ox, oy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                t[fy + oy][fx + ox] = "6" if col == "Y" else "F"
    return t


def path_base(seed=3):
    rnd = random.Random(seed)
    t = tile_fill("a")
    for _ in range(8):
        t[rnd.randrange(16)][rnd.randrange(16)] = "N"
    for _ in range(4):
        t[rnd.randrange(16)][rnd.randrange(16)] = "E"
    return t


def grass_mask(dirs):
    """True where grass covers the tile, given grass on the listed sides."""
    m = [[False] * 16 for _ in range(16)]
    for y in range(16):
        for x in range(16):
            if "N" in dirs and y < WAVE[x]:
                m[y][x] = True
            if "S" in dirs and y > 15 - WAVE[x]:
                m[y][x] = True
            if "W" in dirs and x < WAVE[y]:
                m[y][x] = True
            if "E" in dirs and x > 15 - WAVE[y]:
                m[y][x] = True
    return m


def path_edge(dirs):
    t = path_base(seed=5)
    g = grass_tile(7)
    m = grass_mask(dirs)
    for y in range(16):
        for x in range(16):
            if m[y][x]:
                t[y][x] = g[y][x]
            else:  # dark lip where path meets grass
                for ox, oy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nx, ny = x + ox, y + oy
                    if 0 <= nx < 16 and 0 <= ny < 16 and m[ny][nx]:
                        t[y][x] = "N"
                        break
    return t


# Crest rows differ per variant so neighbouring tiles don't line up.
WATER_CRESTS = [(3, 11), (7, 14), (1, 9)]


def water_tile(frame, variant=0):
    """Open water: depth mottling, drifting swell, and crest glints.

    Every wave has a period dividing 16 in x and y, so tiles stay seamless;
    `frame` and `variant` only shift phase.
    """
    t = tile_fill("B")
    ph = variant * 5.5
    for y in range(16):
        for x in range(16):
            v = (math.sin((x + frame * 1.5 + ph) * math.pi / 8)
                 + 0.7 * math.cos((2 * y - x + frame + ph) * math.pi / 8)
                 + 0.5 * math.sin((x + 3 * y + ph * 2) * math.pi / 8))
            if v > 1.25:
                t[y][x] = "b"       # swell catching the light
            elif v < -1.35:
                t[y][x] = "1"       # depth
    for row in WATER_CRESTS[variant]:   # crests drifting sideways
        for x in range(16):
            if (x + frame * 3 + row * 5 + variant * 6) % 16 < 3:
                t[row][x] = "c"
                t[(row + 1) % 16][x] = "b"
    return t


def _ring(mask, x, y, dist):
    """Is any masked cell within `dist` (chebyshev) of x, y?"""
    for oy in range(-dist, dist + 1):
        for ox in range(-dist, dist + 1):
            nx, ny = x + ox, y + oy
            if 0 <= nx < 16 and 0 <= ny < 16 and mask[ny][nx]:
                return True
    return False


def shore_tile(dirs, frame):
    t = water_tile(frame)
    g = grass_tile(11)
    m = grass_mask(dirs)
    for y in range(16):
        for x in range(16):
            if m[y][x]:
                t[y][x] = g[y][x]
            elif _ring(m, x, y, 1):
                # wet sand with foam that washes along the waterline
                t[y][x] = "6" if (x * 3 + y * 5 + frame * 4) % 11 < 3 else "E"
            elif _ring(m, x, y, 2):
                t[y][x] = "c" if (x + y * 2 + frame * 3) % 9 < 2 else "b"  # shallows
    return t


def brick_wall(hi="4", base="3", lo="2", mortar="1"):
    t = tile_fill(base)
    for y in range(16):
        by = y // 4
        for x in range(16):
            if y % 4 == 3:
                t[y][x] = mortar
            elif (x + (4 if by % 2 else 0)) % 8 == 7:
                t[y][x] = mortar
            elif y % 4 == 0:
                t[y][x] = hi
            elif y % 4 == 2:
                t[y][x] = lo
    return t


def wood_floor():
    rnd = random.Random(21)
    t = tile_fill("t")
    for y in range(16):
        by = y // 4
        for x in range(16):
            if y % 4 == 3:
                t[y][x] = "T"
            elif (x + (5 if by % 2 else 0)) % 11 == 10:
                t[y][x] = "T"
            elif y % 4 == 0 and rnd.random() < 0.25:
                t[y][x] = "d"
    for _ in range(3):
        t[rnd.randrange(16)][rnd.randrange(16)] = "e"
    return t


def stone_floor():
    t = tile_fill("2")
    for y in range(16):
        for x in range(16):
            if y % 8 == 7 or (x + (4 if y // 8 else 0)) % 8 == 7:
                t[y][x] = "1"
            elif y % 8 == 0 or (x + (4 if y // 8 else 0)) % 8 == 0:
                t[y][x] = "3"
    rnd = random.Random(9)
    for _ in range(4):
        t[rnd.randrange(16)][rnd.randrange(16)] = "1"
    return t


def roof_tile(hi="F", base="r", lo="R"):
    t = tile_fill(base)
    for y in range(16):
        by = y // 4
        for x in range(16):
            if y % 4 == 3:
                t[y][x] = lo
            elif y % 4 == 0:
                t[y][x] = hi
            elif (x + (4 if by % 2 else 0)) % 8 == 7:
                t[y][x] = lo
    return t


def build_terrain():
    tree = F(
        ".....000000.....",
        "...00gggggg00...",
        "..0gggggggggG0..",
        ".0ggggggggggGG0.",
        ".0gggGgggggGGG0.",
        "0ggGGgggggGGGGG0",
        "0gGgggggggGGGHG0",
        "0GGgggggggGGHHH0",
        ".0GGGgggGGGHHH0.",
        ".00HGGGGGHHHH00.",
        "..00HHH00HH00...",
        "....000TtT000...",
        "......0TtTe0....",
        "......0TtTe0....",
        ".....0TTtTTe0...",
        "................",
    )
    stone = F(
        "................",
        "................",
        "................",
        "................",
        "................",
        "......0000......",
        "....00444400....",
        "...0454444430...",
        "..0454444444330.",
        "..0444444443330.",
        "..0344444333320.",
        "..0333333332220.",
        "..0223322222220.",
        "...00222222200..",
        ".....000000.....",
        "................",
    )
    door = F(
        "0000000000000000",
        "0333333333333330",
        "0330000000000330",
        "0300tttttttt0030",
        "030tttttttttt030",
        "030tttttttttt030",
        "030ttTttttTtt030",
        "030ttTttttTtt030",
        "030ttTttttTtt030",
        "030ttTttttTtt030",
        "030ttTttyyTtt030",
        "030ttTttyyTtt030",
        "030ttTttttTtt030",
        "030ttTttttTtt030",
        "030eeeeeeeeee030",
        "0000000000000000",
    )
    tree_pine = F(
        "................",
        "................",
        ".......00.......",
        "......0gG0......",
        "......0gG0......",
        ".....0gggG0.....",
        ".....0gGGG0.....",
        "....0ggggGG0....",
        "....0gGGGGG0....",
        "...0gggggGGG0...",
        "...0gGGHHGGG0...",
        "..0ggggGGHHHG0..",
        "..00GGHHHHH000..",
        ".....0TtT0......",
        ".....0TtTe0.....",
        "................",
    )
    tree_small = F(
        "................",
        "................",
        "................",
        "......0000......",
        ".....0gggg0.....",
        "....0ggggGG0....",
        "....0gGggGG0....",
        "...0ggggGGGG0...",
        "...0gGGgGGHG0...",
        "...0GGGGGHHH0...",
        "....0GHHHHH0....",
        ".....00TtT00....",
        "......0TtTe0....",
        "......0TtTe0....",
        ".....0TTtTTe0...",
        "................",
    )
    bush = F(
        "................",
        "................",
        "................",
        "................",
        "................",
        "......0000......",
        "....00gggg00....",
        "...0gggggggG0...",
        "..0ggGggggGGG0..",
        "..0gGGgggGGHG0..",
        "..0GGGGgGGHHH0..",
        "...0GGHHHHHH0...",
        "....00HHHH00....",
        "......0000......",
        "................",
        "................",
    )
    # building facade pieces
    def roof_slope(flip=False):
        t = roof_tile()
        for y in range(16):
            cut = 16 - y  # diagonal gable edge
            for x in range(16):
                xx = 15 - x if flip else x
                if xx >= cut:
                    t[y][x] = TRANSPARENT
                elif xx == cut - 1:
                    t[y][x] = "0"
        return t

    roof_eave = F(
        "0000000000000000",
        "0RRRRRRRRRRRRRR0",
        "0RrrrrrrrrrrrrR0",
        "0RRRRRRRRRRRRRR0",
        "0000000000000000",
        "0eeeeeeeeeeeeee0",
        "0TTTTTTTTTTTTTT0",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    )
    # stone wall with a warm lit window: timber frame, cross mullion, sill
    wall_window = brick_wall()
    for y in range(2, 13):
        for x in range(3, 13):
            wall_window[y][x] = "T"
    for y in range(3, 12):
        for x in range(4, 12):
            wall_window[y][x] = "y" if (x + y) % 5 else "Y"
    for y in range(3, 12):        # vertical mullion
        wall_window[y][7] = "e"
        wall_window[y][8] = "T"
    for x in range(4, 12):        # horizontal mullion
        wall_window[7][x] = "e"
        wall_window[8][x] = "T"
    for x in range(4, 12):        # top-left panes catch more light
        for y in range(3, 7):
            if wall_window[y][x] in ("y", "Y") and x < 7:
                wall_window[y][x] = "Y"
    for x in range(2, 14):        # sill
        wall_window[13][x] = "4"
        wall_window[14][x] = "2"
    wall_window[13][2] = "0"
    wall_window[13][13] = "0"

    s = Sheet("terrain", 16)
    s.add("grass_1", [grass_tile(1)])
    s.add("grass_2", [grass_tile(2)])
    s.add("grass_3", [grass_tile(4)])
    s.add("grass_flowers", [grass_tile(3, flowers=True)])
    s.add("path", [path_base()])
    for d in ["N", "S", "E", "W", "NW", "NE", "SW", "SE"]:
        s.add("path_edge_" + d.lower(), [path_edge(d)])
    for v in range(3):
        s.add("water" + ("" if v == 0 else "_" + "bc"[v - 1]),
              [water_tile(f, v) for f in range(4)], 5)
    for d in ["N", "S", "E", "W", "NW", "NE", "SW", "SE"]:
        s.add("shore_" + d.lower(), [shore_tile(d, f) for f in range(4)], 5)
    s.add("tree", [tree])
    s.add("tree_pine", [tree_pine])
    s.add("tree_small", [tree_small])
    s.add("bush", [bush])
    s.add("stone", [stone])
    s.add("wall_stone", [brick_wall()])
    s.add("wall_dungeon", [recolor(brick_wall(), {"3": "2", "4": "3", "2": "1", "1": "0"})])
    s.add("wall_wood", [recolor(brick_wall(), {"3": "t", "4": "d", "2": "T", "1": "e"})])
    s.add("floor_wood", [wood_floor()])
    s.add("floor_stone", [stone_floor()])
    s.add("roof_red", [roof_tile()])
    s.add("roof_blue", [roof_tile("b", "B", "1")])
    s.add("roof_red_l", [roof_slope()])
    s.add("roof_red_r", [roof_slope(flip=True)])
    s.add("roof_blue_l", [recolor(roof_slope(), {"F": "b", "r": "B", "R": "1"})])
    s.add("roof_blue_r", [recolor(roof_slope(flip=True), {"F": "b", "r": "B", "R": "1"})])
    s.add("roof_eave", [roof_eave])
    s.add("roof_eave_blue", [recolor(roof_eave, {"R": "1", "r": "B"})])
    s.add("wall_window", [wall_window])
    s.add("door", [door])
    return s


# ---------------------------------------------------------------------------
# DECALS — scattered over grass to break up tiling.
# ---------------------------------------------------------------------------

def build_decals():
    def blank_t():
        return blank(16, 16)

    flowers_white = blank_t()
    for fx, fy in [(3, 5), (9, 3), (6, 11), (12, 9)]:
        plot(flowers_white, fx, fy, "6")
        plot(flowers_white, fx - 1, fy, "5")
        plot(flowers_white, fx + 1, fy, "5")
        plot(flowers_white, fx, fy - 1, "5")
        plot(flowers_white, fx, fy + 1, "Y")
        plot(flowers_white, fx, fy + 2, "H")

    flowers_red = blank_t()
    for fx, fy in [(4, 4), (11, 6), (7, 12)]:
        plot(flowers_red, fx, fy, "r")
        plot(flowers_red, fx - 1, fy, "R")
        plot(flowers_red, fx + 1, fy, "F")
        plot(flowers_red, fx, fy - 1, "F")
        plot(flowers_red, fx, fy + 1, "R")
        plot(flowers_red, fx, fy + 2, "H")

    tuft = blank_t()
    for bx, by, h in [(3, 12, 4), (5, 13, 5), (7, 12, 3), (11, 13, 4), (13, 12, 3)]:
        for i in range(h):
            plot(tuft, bx + (1 if i > h - 2 else 0), by - i, "G" if i == 0 else "g")
        plot(tuft, bx, by + 1, "H")

    pebbles = blank_t()
    for px, py, w in [(4, 9, 3), (9, 5, 2), (11, 11, 3), (6, 13, 2)]:
        for i in range(w):
            plot(pebbles, px + i, py, "4")
            plot(pebbles, px + i, py + 1, "3")
        plot(pebbles, px, py, "5")
        plot(pebbles, px - 1, py + 1, "0")
        plot(pebbles, px + w, py + 1, "0")

    mushrooms = blank_t()
    for mx, my in [(5, 8), (10, 11)]:
        for dx in range(-2, 3):
            plot(mushrooms, mx + dx, my, "r")
        plot(mushrooms, mx - 2, my, "R")
        plot(mushrooms, mx + 2, my, "R")
        plot(mushrooms, mx - 1, my - 1, "F")
        plot(mushrooms, mx, my - 1, "r")
        plot(mushrooms, mx + 1, my - 1, "R")
        plot(mushrooms, mx, my + 1, "E")
        plot(mushrooms, mx, my + 2, "N")

    log = blank_t()
    for x in range(2, 14):
        plot(log, x, 8, "0")
        plot(log, x, 9, "t")
        plot(log, x, 10, "T")
        plot(log, x, 11, "e")
        plot(log, x, 12, "0")
    for y in range(9, 12):
        plot(log, 2, y, "0")
    plot(log, 13, 9, "d")
    plot(log, 13, 10, "T")
    plot(log, 14, 10, "0")
    plot(log, 6, 9, "d")
    plot(log, 10, 10, "e")

    cracks = blank_t()
    for cx, cy in [(3, 4), (4, 5), (5, 5), (6, 6), (10, 9), (11, 10), (12, 10)]:
        plot(cracks, cx, cy, "1")
    for cx, cy in [(4, 4), (5, 6), (11, 9)]:
        plot(cracks, cx, cy, "0")

    rubble = blank_t()
    for rx, ry in [(4, 7), (9, 4), (11, 12), (6, 12)]:
        plot(rubble, rx, ry, "3")
        plot(rubble, rx + 1, ry, "2")
        plot(rubble, rx, ry + 1, "1")
        plot(rubble, rx + 1, ry + 1, "1")

    s = Sheet("decals", 16)
    s.add("dec_flowers_white", [flowers_white])
    s.add("dec_flowers_red", [flowers_red])
    s.add("dec_tuft", [tuft])
    s.add("dec_pebbles", [pebbles])
    s.add("dec_mushrooms", [mushrooms])
    s.add("dec_log", [log])
    s.add("dec_cracks", [cracks])
    s.add("dec_rubble", [rubble])
    return s


# ---------------------------------------------------------------------------
# PROPS
# ---------------------------------------------------------------------------

def build_props():
    chest_closed = F(
        "................",
        "................",
        "................",
        "..000000000000..",
        ".0ddddtttttttt0.",
        ".0dttttttttttT0.",
        ".0tttttttttttT0.",
        ".0eeeee0yy0eee0.",
        ".0TTTTT0yy0TTT0.",
        ".0TTTTTT00TTTT0.",
        ".0TTTTTTTTTTTT0.",
        ".0TTTTTTTTTTTT0.",
        ".0eTTTTTTTTTTe0.",
        "..000000000000..",
        "................",
        "................",
    )
    chest_open = F(
        "................",
        "..000000000000..",
        ".0dddddddddddd0.",
        ".0dttttttttttT0.",
        "..000000000000..",
        ".01111111111110.",
        ".011yYy11yY1110.",
        ".0yYyYyyYyYyyy0.",
        ".0TTTTTTTTTTTT0.",
        ".0TTTTT0yy0TTT0.",
        ".0TTTTTT00TTTT0.",
        ".0TTTTTTTTTTTT0.",
        ".0eTTTTTTTTTTe0.",
        "..000000000000..",
        "................",
        "................",
    )
    sign = F(
        "................",
        "................",
        "................",
        "..000000000000..",
        ".0dddttttttttT0.",
        ".0teeteetteetT0.",
        ".0tttttttttttT0.",
        ".0teetteeteetT0.",
        "..000000000000..",
        "......0TT0......",
        "......0TT0......",
        "......0Tt0......",
        "......0TT0......",
        "......0TT0......",
        "......0ee0......",
        "................",
    )

    def torch(flame_rows):
        base = F(
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "......0tT0......",
            "......0tT0......",
            ".....00tT00.....",
            ".....0e0e0e0....",
            "................",
            "................",
        )
        for y, row in enumerate(flame_rows):
            for x, ch in enumerate(row):
                if ch != ".":
                    plot(base, x, y + 4, ch)
        return base

    flame1 = [
        ".......0........",
        "......0Y0.......",
        "......0Yy0......",
        ".....0yYyo0.....",
        ".....0oyyo0.....",
        "......0oo0......",
    ]
    flame2 = [
        "......0.........",
        ".....0Y0........",
        ".....0Yy0.......",
        ".....0yYyo0.....",
        "....0oyYyo0.....",
        ".....0oyo0......",
    ]
    flame3 = [
        "........0.......",
        ".......0Y0......",
        "......0yY0......",
        ".....0oyYy0.....",
        ".....0oyYyo0....",
        "......0oyo0.....",
    ]
    fence = F(
        "................",
        "................",
        "................",
        "................",
        "......0000......",
        "......0TTe0.....",
        "0000000TTe000000",
        "dddddd0TTe0ddddd",
        "tttttt0TTe0ttttt",
        "0000000TTe000000",
        "......0TTe0.....",
        "0000000TTe000000",
        "dddddd0TTe0ddddd",
        "tttttt0TTe0ttttt",
        "0000000TTe000000",
        "................",
    )
    barrel = F(
        "................",
        "................",
        "................",
        "................",
        "....00000000....",
        "...0tddddttt0...",
        "..0tddddtttttT0.",
        "..034444444430..",
        "..0ttdddttttT0..",
        "..0ttdddttttT0..",
        "..034444444430..",
        "..0ttdddttttT0..",
        "..0tttttttttT0..",
        "...0TttttttT0...",
        "....00000000....",
        "................",
    )
    s = Sheet("props", 16)
    s.add("chest_closed", [chest_closed])
    s.add("chest_open", [chest_open])
    s.add("sign", [sign])
    s.add("torch", [torch(flame1), torch(flame2), torch(flame3)], 8)
    s.add("fence", [fence])
    s.add("barrel", [barrel])
    return s


# ---------------------------------------------------------------------------
# ITEM ICONS
# ---------------------------------------------------------------------------

def build_items():
    dagger = F(
        "................",
        "................",
        "................",
        "...........00...",
        "..........0650..",
        ".........06500..",
        "........06500...",
        ".......06500....",
        "..00..06500.....",
        "..0y006500......",
        "...0y05000......",
        "...00yy00.......",
        "..0TT0y00.......",
        "..0TT000........",
        "...00...........",
        "................",
    )
    sword = F(
        "..............0.",
        ".............060",
        "............0650",
        "...........06500",
        "..........06500.",
        ".........06500..",
        "........06500...",
        ".......06500....",
        "..00..06500.....",
        "..0yy06500......",
        "...0yy5000......",
        "...00yy00.......",
        "..0TT00y0.......",
        ".0TTT0000.......",
        ".0T000..........",
        "..00............",
    )
    greatsword = F(
        ".............00.",
        "............0Y60",
        "...........0Y650",
        "..........0Y650.",
        ".........0Y650..",
        "........0Y650...",
        ".......0Y650....",
        "..00..0Y650.....",
        "..0yy0Y650......",
        "...0yyY500......",
        "...00yyy00......",
        "..0TT00yy0......",
        ".0TTT000y0......",
        ".0TT0000........",
        "..000...........",
        "................",
    )
    armor_t = F(
        "................",
        "................",
        "...00......00...",
        "..0tt0....0tt0..",
        "..0ttt0000ttt0..",
        "..0tttttttttt0..",
        "..0tTttttttTtT0.",
        "...0ttttttttT0..",
        "...0tddddtttT0..",
        "...0tddddtttT0..",
        "...0ttttttttT0..",
        "....0ttttttT0...",
        "....00000000....",
        "................",
        "................",
        "................",
    )
    armor_leather = armor_t
    armor_chain = recolor(armor_t, {"t": "4", "d": "5", "T": "3", "e": "2"})
    for x, y in [(5, 6), (7, 6), (9, 6), (6, 7), (8, 7), (10, 7), (5, 8), (7, 8), (9, 8)]:
        plot(armor_chain, x, y + 2, "3")
    armor_plate = recolor(armor_t, {"t": "5", "d": "6", "T": "4"})
    for x, y in [(7, 4), (8, 4), (7, 5), (8, 5)]:
        plot(armor_plate, x, y, "y")

    def potion(big, liquid="r", dark="R", hi="F"):
        f = F(
            "................",
            "................",
            "................",
            "................",
            "......0000......",
            "......0tt0......",
            ".....000000.....",
            ".....056650.....",
            "....05%s%s%s%s50...." % ((liquid,) * 4),
            "...06%s%s%s%s%s%s50..." % ((liquid,) * 6),
            "...05%s%s%s%s%s%s%s0..." % ((liquid,) * 6 + (dark,)),
            "...05%s%s%s%s%s%s%s0..." % ((hi,) + (liquid,) * 4 + (dark,) * 2),
            "....05%s%s%s%s%s0...." % ((dark,) * 5),
            ".....000000.....",
            "................",
            "................",
        )
        return f

    potion_small = potion(False)
    potion_large = recolor(potion(False), {"r": "b", "R": "B", "F": "c"})
    gel = F(
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "......0000......",
        "....00gggg00....",
        "...0g6ggggggG0..",
        "..0gggggggggG0..",
        "..0GGggggGGGG0..",
        "...00GGGGGG00...",
        "................",
    )
    bone = F(
        "................",
        "................",
        "................",
        "..........000...",
        ".........06560..",
        "......000655500.",
        "......05555400..",
        ".....0555400....",
        "....0555400.....",
        "...05554000.....",
        "..0655540.......",
        ".0665504550.....",
        ".0655055550.....",
        "..000.0550......",
        "................",
        "................",
    )
    letter = F(
        "................",
        "................",
        "................",
        "................",
        "..000000000000..",
        ".0EEEEEEEEEEEE0.",
        ".0EeEEEEEEEEeE0.",
        ".0EEeEEEEEEeEE0.",
        ".0EEEeEEEEeEEE0.",
        ".0EEEEerreEEEE0.",
        ".0EEEEErrEEEEE0.",
        ".0EEEEEEEEEEEE0.",
        "..000000000000..",
        "................",
        "................",
        "................",
    )
    herb = F(
        "................",
        "................",
        "................",
        "....00...00.....",
        "...0gg0.0gg0....",
        "..0ggg0.0ggg0...",
        "..0gG0g0g0Gg0...",
        "...00.0g0.00....",
        "....00gG00......",
        "...0gg0g0gg0....",
        "..0ggG0g0Ggg0...",
        "...000TgT000....",
        "......0T0.......",
        "......0T0.......",
        ".......0........",
        "................",
    )
    key = F(
        "................",
        "................",
        "................",
        "......0000......",
        ".....0yYYy0.....",
        ".....0y00y0.....",
        ".....0y00y0.....",
        ".....0yyyy0.....",
        "......0yy0......",
        "......0yy0......",
        "......0yy0yy0...",
        "......0yy00y0...",
        "......0yy0yy0...",
        ".......000000...",
        "................",
        "................",
    )
    amulet = F(
        "................",
        "................",
        "....0y0..0y0....",
        "...0y0....0y0...",
        "...0y0....0y0...",
        "....0y0..0y0....",
        ".....0y00y0.....",
        "......0yy0......",
        ".......00.......",
        "......06c0......",
        ".....06ccb0.....",
        "....06cccbb0....",
        ".....0ccbb0.....",
        "......0cb0......",
        ".......00.......",
        "................",
    )
    s = Sheet("items", 16)
    s.add("item_dagger", [dagger])
    s.add("item_sword", [sword])
    s.add("item_greatsword", [greatsword])
    s.add("item_armor_leather", [armor_leather])
    s.add("item_armor_chain", [armor_chain])
    s.add("item_armor_plate", [armor_plate])
    s.add("item_potion", [potion_small])
    s.add("item_potion_big", [potion_large])
    s.add("item_gel", [gel])
    s.add("item_bone", [bone])
    s.add("item_letter", [letter])
    s.add("item_herb", [herb])
    s.add("item_key", [key])
    s.add("item_amulet", [amulet])
    return s


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------

def build_ui():
    heart_full = F(
        "................",
        "................",
        "..0000..0000....",
        ".06Frr00rrrR0...",
        ".0FrrrrrrrrrR0..",
        ".0rrrrrrrrrrR0..",
        ".0RrrrrrrrrrR0..",
        "..0RrrrrrrrR0...",
        "...0RrrrrrR0....",
        "....0RrrrR0.....",
        ".....0RrR0......",
        "......0R0.......",
        ".......0........",
        "................",
        "................",
        "................",
    )
    heart_empty = recolor(heart_full, {"r": "1", "R": "1", "F": "2", "6": "2"})
    heart_half = [row[:] for row in heart_empty]
    full = heart_full
    for y in range(16):
        for x in range(8):
            if full[y][x] != TRANSPARENT:
                heart_half[y][x] = full[y][x]

    def coin_full():
        return F(
            "................",
            "................",
            "................",
            ".....OOOOOO.....",
            "....OYYYYyyO....",
            "...OY6YYyyyyO...",
            "...OY6YyyyyyO...",
            "...OYYyyyyyoO...",
            "...OYyyyyyooO...",
            "...OyyyyyoooO...",
            "....OyyyoooO....",
            ".....OOOOOO.....",
            "................",
            "................",
            "................",
            "................",
        )

    coin_mid = F(
        "................",
        "................",
        "................",
        "......OOOO......",
        ".....OYYyyO.....",
        "....OY6YyyyO....",
        "....OY6yyyyO....",
        "....OYyyyyoO....",
        "....OYyyyooO....",
        "....OyyyoooO....",
        ".....OyyooO.....",
        "......OOOO......",
        "................",
        "................",
        "................",
        "................",
    )
    coin_thin = F(
        "................",
        "................",
        "................",
        ".......OO.......",
        "......OYyO......",
        "......OYyO......",
        "......OYyO......",
        "......OYyO......",
        "......OYyO......",
        "......OyoO......",
        "......OyoO......",
        ".......OO.......",
        "................",
        "................",
        "................",
        "................",
    )
    s = Sheet("ui", 16)
    s.add("heart_full", [heart_full])
    s.add("heart_half", [heart_half])
    s.add("heart_empty", [heart_empty])
    s.add("coin", [coin_full(), coin_mid, coin_thin, mirror(coin_mid)], 8)
    return s


def build_panel():
    """Ornate 9-slice frame: black edge, bronze trim, bevelled interior."""
    size = 48
    f = blank(size, size)
    for y in range(size):
        for x in range(size):
            d = min(x, y, size - 1 - x, size - 1 - y)
            if d == 0:
                f[y][x] = "0"          # outer keyline
            elif d == 1:
                f[y][x] = "y" if (x <= 1 or y <= 1) else "O"   # lit / shaded trim
            elif d == 2:
                f[y][x] = "e"          # dark rebate under the trim
            else:
                f[y][x] = "1"          # panel field
    # inner bevel: light along the top-left, shadow along the bottom-right
    for i in range(3, size - 3):
        f[3][i] = "2"
        f[i][3] = "2"
        f[size - 4][i] = "0"
        f[i][size - 4] = "0"
    f[3][3] = "3"
    # corner studs
    for cx, cy in [(1, 1), (1, size - 2), (size - 2, 1), (size - 2, size - 2)]:
        f[cy][cx] = "Y"
        for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = cx + ox, cy + oy
            if 1 <= nx < size - 1 and 1 <= ny < size - 1 and min(nx, ny, size - 1 - nx, size - 1 - ny) == 1:
                f[ny][nx] = "y"
    s = Sheet("panel", 48)
    s.add("panel", [f])
    return s


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = {
        "palette": {k: "#%02x%02x%02x" % v for k, v in PALETTE.items()},
        "sheets": {},
        "anims": {},
    }
    builders = {
        "player": build_player,
        "npcs": build_npcs,
        "slime": build_slime,
        "skeleton": build_skeleton,
        "bat": build_bat,
        "archer": build_archer,
        "brute": build_brute,
        "boss": build_boss_sheet,
        "terrain": build_terrain,
        "decals": build_decals,
        "props": build_props,
        "items": build_items,
        "ui": build_ui,
        "panel": build_panel,
    }
    only = set(sys.argv[1:])
    unknown = only - set(builders)
    if unknown:
        sys.exit(f"unknown sheet(s): {', '.join(sorted(unknown))}. "
                 f"choose from: {', '.join(builders)}")
    for name, fn in builders.items():
        sheet = fn()
        path = sheet.build(manifest)
        if not only or name in only:
            print("wrote", path)
    mpath = os.path.join(OUT_DIR, "manifest.json")
    with open(mpath, "w") as fh:
        json.dump(manifest, fh, indent=1)
    print("wrote", mpath)


if __name__ == "__main__":
    main()
