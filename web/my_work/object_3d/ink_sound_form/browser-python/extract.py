"""把这一段手卷拆成笔画，再收成钢琴上的四个八度。

顺序仍是从右往左、列内从上往下。音高不看在纸上的高低。
笔画在交叉处拆开，一笔弯过去仍算一笔。
大小定音高：笔画长的低（C3），短的高（C7），中间按半音。
粗细定拍子：细的短，粗的长。
浓淡定音色：浓的闷，淡的亮。
速度看飞白：照片里没有运笔时间，笔道断、墨色跳的当作快，下一笔来得紧。
连笔同时响，整组再低一个八度。
"""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "prints" / "2026-10-25_scroll.jpg"
OUT = Path(__file__).resolve().parent / "score.json"

# 单独一笔落在 C3–C7。连笔再低八度，由播放时把频率减半，不写进这里。
PIANO_LOW = 48
PIANO_SPAN = 48
PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def piano_of(t_len):
    semis = int(round((1 - float(t_len)) * PIANO_SPAN))
    semis = max(0, min(PIANO_SPAN, semis))
    midi = PIANO_LOW + semis
    name = PC[midi % 12] + str(midi // 12 - 1)
    freq = round(440.0 * (2 ** ((midi - 69) / 12.0)), 2)
    return name, freq, midi


# 描摹成黑白，类似图像描摹：先看附近的纸色，再把比纸暗过一截的地方收成黑。
# TRACE_PAPER 是看纸色的窗口，要盖得过笔道。TRACE_DARK 越小越只留浓墨，越大越把淡墨收进来。
TRACE_PAPER = 41
TRACE_DARK = 0.82
TRACE_SPECK = 8


def ink_mask(rgb):
    r, g, b = [rgb[:, :, i].astype(np.float32) for i in range(3)]
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = (mx - mn) / np.maximum(mx, 1)
    seal = (sat > 0.42) & (r > g + 18) & (r > b + 8) & (lum > 50)
    gray = np.clip(lum, 0, 255).astype(np.uint8)
    paper = cv2.morphologyEx(
        gray,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (TRACE_PAPER, TRACE_PAPER)),
    )
    ratio = gray.astype(np.float32) / np.maximum(paper.astype(np.float32), 1.0)
    ink = (ratio < TRACE_DARK) & ~seal
    u8 = cv2.morphologyEx((ink.astype(np.uint8)) * 255, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(u8, connectivity=8)
    keep = np.zeros(ink.shape, bool)
    for i in range(1, count):
        if stats[i, cv2.CC_STAT_AREA] >= TRACE_SPECK:
            keep[labels == i] = True
    return keep, lum


def find_columns(ink):
    sm = np.convolve(ink.sum(0).astype(np.float32), np.ones(17) / 17, mode="same")
    thr = 10
    content, in_run = [], False
    for x, v in enumerate(sm):
        if v >= thr and not in_run:
            start, in_run = x, True
        elif v < thr and in_run:
            content.append((start, x - 1))
            in_run = False
    if in_run:
        content.append((start, len(sm) - 1))
    merged = []
    for s, e in content:
        if merged and s - merged[-1][1] < 14:
            merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))
    merged = [(s, e) for s, e in merged if e - s > 18]

    def split_wide(spans):
        out = []
        for s, e in spans:
            if e - s < 108:
                out.append((s, e))
                continue
            margin = 36
            seg = sm[s + margin : e - margin + 1]
            if len(seg) < 8:
                out.append((s, e))
                continue
            cut = s + margin + int(np.argmin(seg))
            left = float(sm[s:cut].max()) if cut > s else 0
            right = float(sm[cut : e + 1].max()) if e + 1 > cut else 0
            valley = float(sm[cut])
            if (
                valley < 0.55 * min(left, right)
                and valley < 28
                and cut - s > 36
                and e - cut > 36
            ):
                out.extend(split_wide([(s, cut - 1), (cut + 1, e)]))
            else:
                out.append((s, e))
        return out

    cols = split_wide(merged)
    cols.sort(key=lambda se: se[0], reverse=True)
    return cols


def zhang_suen(img):
    img = img.copy()
    changed = True
    while changed:
        changed = False
        for step in (0, 1):
            padded = np.pad(img, 1)
            p2, p3 = padded[:-2, 1:-1], padded[:-2, 2:]
            p4, p5 = padded[1:-1, 2:], padded[2:, 2:]
            p6, p7 = padded[2:, 1:-1], padded[2:, :-2]
            p8, p9 = padded[1:-1, :-2], padded[:-2, :-2]
            p1 = padded[1:-1, 1:-1]
            count = p2.astype(np.uint8) + p3 + p4 + p5 + p6 + p7 + p8 + p9
            turns = np.zeros(p1.shape, np.uint8)
            prev = p2
            for nbr in (p3, p4, p5, p6, p7, p8, p9, p2):
                turns += ~prev & nbr
                prev = nbr
            cond = p1 & (count >= 2) & (count <= 6) & (turns == 1)
            if step == 0:
                cond &= (~p2 | ~p4 | ~p6) & (~p4 | ~p6 | ~p8)
            else:
                cond &= (~p2 | ~p4 | ~p8) & (~p2 | ~p6 | ~p8)
            if cond.any():
                img[cond] = False
                changed = True
    return img


def thin_to_line(skel):
    """去掉斜向双线，让交叉处才算分叉。"""
    skel = np.pad(skel, 1)
    changed = True
    while changed:
        changed = False
        ys, xs = np.nonzero(skel)
        for y, x in zip(ys.tolist(), xs.tolist()):
            if not skel[y, x]:
                continue
            patch = skel[y - 1 : y + 2, x - 1 : x + 2].copy()
            if patch.sum() <= 2:
                continue
            patch[1, 1] = False
            seen = np.zeros((3, 3), bool)
            parts = 0
            for i in range(3):
                for j in range(3):
                    if not patch[i, j] or seen[i, j]:
                        continue
                    parts += 1
                    stack = [(i, j)]
                    seen[i, j] = True
                    while stack:
                        a, b = stack.pop()
                        for da in (-1, 0, 1):
                            for db in (-1, 0, 1):
                                if da == 0 and db == 0:
                                    continue
                                ia, ib = a + da, b + db
                                if 0 <= ia < 3 and 0 <= ib < 3 and patch[ia, ib] and not seen[ia, ib]:
                                    seen[ia, ib] = True
                                    stack.append((ia, ib))
            if parts <= 1:
                skel[y, x] = False
                changed = True
    return skel[1:-1, 1:-1]


def drop_spurs(skel, limit=10):
    skel = skel.copy()
    changed = True
    while changed:
        changed = False
        nbrs = neighbors(skel)
        nodes = {p for p, n in nbrs.items() if len(n) != 2}
        for end, near in list(nbrs.items()):
            if len(near) != 1:
                continue
            path = [end]
            prev, cur = end, near[0]
            hit = False
            for _ in range(limit):
                path.append(cur)
                if cur in nodes and cur != end:
                    hit = True
                    break
                nxt = [p for p in nbrs.get(cur, []) if p != prev]
                if len(nxt) != 1:
                    break
                prev, cur = cur, nxt[0]
            if hit and len(path) <= limit:
                for y, x in path[:-1]:
                    skel[y, x] = False
                changed = True
    return skel


def stroke_skeleton(ink):
    u8 = (ink.astype(np.uint8)) * 255
    u8 = cv2.morphologyEx(u8, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    u8 = cv2.medianBlur(u8, 3)
    count, labels, stats, _ = cv2.connectedComponentsWithStats((u8 > 0).astype(np.uint8), 8)
    clean = np.zeros(ink.shape, bool)
    for i in range(1, count):
        if stats[i, cv2.CC_STAT_AREA] >= 40:
            clean[labels == i] = True
    return drop_spurs(thin_to_line(zhang_suen(clean)))


def neighbors(skel):
    h, w = skel.shape
    ys, xs = np.nonzero(skel)
    nbrs = {}
    for y, x in zip(ys.tolist(), xs.tolist()):
        found = []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and skel[yy, xx]:
                    found.append((yy, xx))
        nbrs[(y, x)] = found
    return nbrs


def trace_paths(nbrs):
    nodes = {p for p, n in nbrs.items() if len(n) != 2}
    used = set()
    paths = []

    def walk(start, nxt):
        path = [start, nxt]
        used.add((start, nxt))
        prev, cur = start, nxt
        guard = 0
        while cur not in nodes and guard < 8000:
            guard += 1
            cands = [p for p in nbrs[cur] if p != prev]
            if len(cands) != 1:
                break
            prev, cur = cur, cands[0]
            used.add((prev, cur))
            path.append(cur)
        used.add((path[-1], path[-2]))
        return path

    for node in list(nodes):
        for nxt in nbrs[node]:
            if (node, nxt) in used:
                continue
            paths.append(walk(node, nxt))

    seen = set()
    for path in paths:
        seen.update(path)
    for p in nbrs:
        if p in seen:
            continue
        path = [p]
        seen.add(p)
        prev, cur = None, p
        guard = 0
        while guard < 8000:
            guard += 1
            cands = [q for q in nbrs[cur] if q != prev and q not in seen]
            if not cands:
                if prev is not None and p in nbrs[cur]:
                    path.append(p)
                break
            prev, cur = cur, cands[0]
            path.append(cur)
            seen.add(cur)
        if len(path) > 8:
            paths.append(path)
    return paths, nodes, nbrs


def continuous_paths(paths, nbrs):
    """Continue compatible ink branches through a crossing, without bridging gaps."""
    junctions = {p for p, near in nbrs.items() if len(near) > 2}
    clusters, membership = [], {}
    for p in sorted(junctions):
        if p in membership:
            continue
        group, stack = set(), [p]
        while stack:
            q = stack.pop()
            if q in group:
                continue
            group.add(q)
            stack.extend(n for n in nbrs[q] if n in junctions and n not in group)
        index = len(clusters)
        membership.update((q, index) for q in group)
        clusters.append(group)

    routes, arms = [], [[] for _ in clusters]
    for path in paths:
        if len(path) < 2:
            continue
        first, last = membership.get(path[0]), membership.get(path[-1])
        if first is not None and first == last and all(p in clusters[first] for p in path):
            continue
        index = len(routes)
        routes.append(path)
        for side, group in ((0, first), (1, last)):
            if group is not None:
                points = path if side == 0 else path[::-1]
                sample = points[min(7, len(points) - 1)]
                vector = np.asarray(sample, float) - points[0]
                norm = np.linalg.norm(vector)
                if norm > 2:
                    arms[group].append(((index, side), vector / norm))

    links = {}
    for group in arms:
        candidates = []
        for i, (a, va) in enumerate(group):
            for b, vb in group[i + 1:]:
                dot = float(np.dot(va, vb))
                if dot < -0.82:
                    candidates.append((dot, a, b))
        for _, a, b in sorted(candidates):
            if a not in links and b not in links:
                links[a], links[b] = b, a

    def crossing(a, b):
        if a == b:
            return []
        group = clusters[membership[a]]
        previous, stack = {a: None}, [a]
        for p in stack:
            if p == b:
                break
            for q in nbrs[p]:
                if q in group and q not in previous:
                    previous[q] = p
                    stack.append(q)
        if b not in previous:
            return []
        bridge, p = [], b
        while p != a:
            bridge.append(p)
            p = previous[p]
        return bridge[::-1]

    result, used = [], set()
    # Begin at an unmatched endpoint; remaining chains are closed loops.
    starts = [(i, side) for i in range(len(routes)) for side in (0, 1) if (i, side) not in links]
    starts += [(i, 0) for i in range(len(routes))]
    for index, side in starts:
        if index in used:
            continue
        chain = []
        while index not in used:
            used.add(index)
            path = routes[index] if side == 0 else routes[index][::-1]
            if chain:
                chain.extend(crossing(chain[-1], path[0]))
            chain.extend(path if not chain or chain[-1] != path[0] else path[1:])
            next_arm = links.get((index, 1 - side))
            if next_arm is None:
                break
            index, side = next_arm
            if index in used:
                if routes[index][0 if side == 0 else -1] == chain[0]:
                    chain.extend(crossing(chain[-1], chain[0]))
                break
        if chain and chain[0] > chain[-1]:
            chain.reverse()
        result.append(chain)
    return result


def split_corners(path, turn=0.9):
    if len(path) < 16:
        return [path]
    k = 5
    cuts = [0]
    for i in range(k, len(path) - k):
        y0, x0 = path[i - k]
        y1, x1 = path[i]
        y2, x2 = path[i + k]
        v1 = np.array([y1 - y0, x1 - x0], dtype=np.float32)
        v2 = np.array([y2 - y1, x2 - x1], dtype=np.float32)
        n1 = np.linalg.norm(v1)
        n2 = np.linalg.norm(v2)
        if n1 < 1 or n2 < 1:
            continue
        cos = float(np.clip(np.dot(v1, v2) / (n1 * n2), -1, 1))
        if cos < np.cos(turn) and i - cuts[-1] > 8:
            cuts.append(i)
    cuts.append(len(path) - 1)
    out = []
    for a, b in zip(cuts, cuts[1:]):
        piece = path[a : b + 1]
        if len(piece) >= 8:
            out.append(piece)
    return out or [path]


def keep_path(path, nbrs):
    if len(path) < 8:
        return False
    if len(path) >= 12:
        return True
    da = len(nbrs.get(path[0], []))
    db = len(nbrs.get(path[-1], []))
    # 短刺丢掉。单独的小点两边都是端点，留下。
    if (da >= 3 or db >= 3) and (da <= 1 or db <= 1):
        return False
    return True


def column_of(x, columns):
    best, dist = 0, 1e9
    for i, (a, b) in enumerate(columns):
        if a <= x <= b:
            return i
        d = min(abs(x - a), abs(x - b))
        if d < dist:
            best, dist = i, d
    return best


def window_density(ii, y, x, rad, h, w):
    y0 = max(0, int(y) - rad)
    x0 = max(0, int(x) - rad)
    y1 = min(h, int(y) + rad)
    x1 = min(w, int(x) + rad)
    total = ii[y1, x1] - ii[y0, x1] - ii[y1, x0] + ii[y0, x0]
    area = max(1, (y1 - y0) * (x1 - x0))
    return total / area


def measure(path, dist, lum, ink, ii, h, w):
    pts = path[::2] if len(path) > 4 else path
    if pts[-1] != path[-1]:
        pts = pts + [path[-1]]
    rs, ls = [], []
    for y, x in pts:
        y0, y1 = max(0, y - 5), min(h, y + 6)
        x0, x1 = max(0, x - 5), min(w, x + 6)
        rs.append(float(dist[y0:y1, x0:x1].max()))
        patch = lum[y0:y1, x0:x1]
        ink_patch = ink[y0:y1, x0:x1]
        ls.append(float(patch[ink_patch].mean()) if ink_patch.any() else float(lum[y, x]))
    rs = np.array(rs)
    ls = np.array(ls)
    length = float(len(path))
    thick = float(np.median(rs))
    light = float(np.mean(ls))
    thin_frac = float(np.mean(rs < max(1.4, 0.45 * np.median(rs))))
    feibai = float(np.clip(np.std(ls) / 28.0, 0, 1) * 0.65 + thin_frac * 0.35)
    top = min(path, key=lambda p: p[0])
    cy = float(np.mean([p[0] for p in path]))
    cx = float(np.mean([p[1] for p in path]))
    dens = window_density(ii, cy, cx, 36, h, w)
    packed = dens / max(thick, 1.0)
    samples = []
    for (y, x), r in zip(pts, rs):
        samples.append([int(x), int(y), round(max(1.5, r), 2)])
    return {
        "length": length,
        "thick": thick,
        "light": light,
        "feibai": feibai,
        "packed": float(packed),
        "y0": int(top[0]),
        "x_top": int(top[1]),
        "points": samples,
    }


def span_unit(values, lo_p=8, hi_p=92):
    lo, hi = np.percentile(values, [lo_p, hi_p])
    if hi <= lo:
        hi = lo + 1
    return float(lo), float(hi)


def unit(value, lo, hi):
    return float(np.clip((value - lo) / (hi - lo), 0, 1))


# 钉在这一段、工作高度 480 上。换一幅字先缩放到这个高度，再套这把尺子。
RULER = {
    "length": (2.81139, 4.06152),
    "thick": (1.39999, 3.0),
    "light": (46.61997, 95.30478),
    "feibai": (0.17749, 0.67799),
    "packed": (0.02725, 0.08446),
}


def to_working_size(rgb):
    height, width = rgb.shape[:2]
    if height == 480:
        return rgb
    new_width = max(1, int(round(width * 480 / height)))
    resized = Image.fromarray(rgb).resize((new_width, 480), Image.Resampling.LANCZOS)
    return np.asarray(resized)


def analyze(rgb):
    """先把输入描成黑白再拆笔画。浓淡仍用原图的明暗。音高尺子不随这张图重新拉满。"""
    rgb = to_working_size(rgb)
    ink, lum = ink_mask(rgb)
    height, width = ink.shape
    columns = find_columns(ink)
    dist = cv2.distanceTransform(ink.astype(np.uint8), cv2.DIST_L2, 5)
    ii = integral(ink)
    skel = stroke_skeleton(ink)
    nbrs = neighbors(skel)
    paths, _, nbrs = trace_paths(nbrs)
    paths = continuous_paths(paths, nbrs)
    pieces = []
    for path in paths:
        if not keep_path(path, nbrs):
            continue
        pieces.append(measure(path, dist, lum, ink, ii, height, width))
    for piece in pieces:
        piece["column"] = column_of(piece["x_top"], columns) + 1
    pieces.sort(key=lambda piece: (piece["column"], piece["y0"], -piece["x_top"]))

    notes = []
    for piece in pieces:
        t_len = unit(np.log(piece["length"]), *RULER["length"])
        t_thick = unit(piece["thick"], *RULER["thick"])
        t_light = unit(piece["light"], *RULER["light"])
        t_fast = unit(piece["feibai"], *RULER["feibai"])
        t_pack = unit(piece["packed"], *RULER["packed"])
        name, freq, midi = piano_of(t_len)
        notes.append(
            {
                "column": piece["column"],
                "name": name,
                "freq": freq,
                "midi": midi,
                "chord": None,
                "dur": round(0.12 + t_thick * 0.32, 3),
                "rest": round(0.13 - t_fast * 0.1, 3),
                "cutoff": round(420 + t_light * 4600),
                "attack": round(0.09 - t_fast * 0.07, 3),
                "words": " · ".join(
                    [
                        word(t_len, "Short", "Medium length", "Long"),
                        word(t_thick, "Thin", "Medium width", "Thick"),
                        word(t_light, "Dark", "Medium tone", "Pale"),
                        word(t_fast, "Slow", "Moderate", "Fast"),
                        word(t_pack, "Sparse", "Medium density", "Dense"),
                    ]
                ),
                "points": piece["points"],
            }
        )
    return {
        "width": int(width),
        "height": int(height),
        "order": "Right to left; top to bottom within each column",
        "mapping": "Fixed reference scale: long strokes C3, short strokes C7. Connected paths sound as chords one octave lower.",
        "scale": {"low": "C3", "high": "C7", "semitones": PIANO_SPAN},
        "notes": notes,
        "analysis": {"method": "Ink continuity", "version": 2, "scope": "whole image", "orderVerified": False},
    }


def word(u, low, mid, high):
    if u < 0.34:
        return low
    if u > 0.66:
        return high
    return mid


def main():
    rgb = np.asarray(Image.open(SRC).convert("RGB"))
    ink, lum = ink_mask(rgb)
    h, w = ink.shape
    columns = find_columns(ink)
    dist = cv2.distanceTransform(ink.astype(np.uint8), cv2.DIST_L2, 5)
    ii = integral(ink)
    skel = stroke_skeleton(ink)
    nbrs = neighbors(skel)
    paths, _, nbrs = trace_paths(nbrs)
    paths = continuous_paths(paths, nbrs)
    pieces = []
    for path in paths:
        # 交叉处已经拆开。太短的是毛刺，不单独成音。
        if not keep_path(path, nbrs):
            continue
        pieces.append(measure(path, dist, lum, ink, ii, h, w))

    for p in pieces:
        p["column"] = column_of(p["x_top"], columns) + 1
    pieces.sort(key=lambda p: (p["column"], p["y0"], -p["x_top"]))

    length = np.array([p["length"] for p in pieces])
    thick = np.array([p["thick"] for p in pieces])
    light = np.array([p["light"] for p in pieces])
    feibai = np.array([p["feibai"] for p in pieces])
    packed = np.array([p["packed"] for p in pieces])
    ranges = {
        "length": span_unit(np.log(length)),
        "thick": span_unit(thick),
        "light": span_unit(light),
        "feibai": span_unit(feibai),
        "packed": span_unit(packed),
    }

    notes = []
    for p in pieces:
        t_len = unit(np.log(p["length"]), *ranges["length"])
        t_thick = unit(p["thick"], *ranges["thick"])
        t_light = unit(p["light"], *ranges["light"])
        t_fast = unit(p["feibai"], *ranges["feibai"])
        t_pack = unit(p["packed"], *ranges["packed"])
        name, freq, midi = piano_of(t_len)
        notes.append(
            {
                "column": p["column"],
                "name": name,
                "freq": freq,
                "midi": midi,
                "chord": None,
                "dur": round(0.12 + t_thick * 0.32, 3),
                "rest": round(0.13 - t_fast * 0.1, 3),
                "cutoff": round(420 + t_light * 4600),
                "attack": round(0.09 - t_fast * 0.07, 3),
                "words": " · ".join(
                    [
                        word(t_len, "Short", "Medium length", "Long"),
                        word(t_thick, "Thin", "Medium width", "Thick"),
                        word(t_light, "Dark", "Medium tone", "Pale"),
                        word(t_fast, "Slow", "Moderate", "Fast"),
                        word(t_pack, "Sparse", "Medium density", "Dense"),
                    ]
                ),
                "points": p["points"],
            }
        )

    score = {
        "source": "my_work/prints/2026-10-25_scroll.jpg",
        "width": int(w),
        "height": int(h),
        "order": "Right to left; top to bottom within each column",
        "mapping": "长为 C3，短为 C7，中间按钢琴半音，共四个八度。细的短，粗的长。浓的闷，淡的亮。飞白多则下一笔紧。连笔为低八度和弦。",
        "scale": {"low": "C3", "high": "C7", "semitones": PIANO_SPAN},
        "notes": notes,
        "analysis": {"method": "Ink continuity", "version": 2, "scope": "whole image", "orderVerified": False},
    }
    text = json.dumps(score, ensure_ascii=False)
    OUT.write_text(text, encoding="utf-8")
    (OUT.parent / "data.js").write_text("const DATA = " + text + ";\n", encoding="utf-8")

    durs = [n["dur"] for n in notes]
    midis = [n["midi"] for n in notes]
    print(
        f"pieces {len(notes)} "
        f"dur {min(durs):.2f}-{max(durs):.2f} "
        f"seconds {sum(n['dur']+n['rest'] for n in notes):.1f}"
    )
    print("thick", ranges["thick"], "light", ranges["light"], "feibai", ranges["feibai"])
    print(f"pitch {min(midis)}-{max(midis)} unique {len(set(n['name'] for n in notes))}")

    vis = rgb.copy()
    for note in notes:
        t = (note["midi"] - PIANO_LOW) / PIANO_SPAN
        c = (int(40 + 20 * (1 - t)), int(70 + 90 * t), int(170 - 80 * t))
        for x, y, _r in note["points"]:
            cv2.circle(vis, (x, y), 2, c, -1)
    Image.fromarray(vis).save("/tmp/scroll_pieces.jpg", quality=90)


def integral(ink):
    pad = np.pad(ink.astype(np.int32), ((1, 0), (1, 0)))
    return pad.cumsum(0).cumsum(1)


if __name__ == "__main__":
    main()
