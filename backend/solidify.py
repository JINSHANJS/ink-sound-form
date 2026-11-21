"""把笔画中心线收成一个可以打印的封闭实体。

屏幕上仍是扁带。这里把每一段收成圆杆，交叉的地方并成一块体积，
再用行进立方体取出外壳。导出前检查：每条边恰好被两张三角形共用，
并且整张网是一个连通的整体。过不了检查就不给文件。
"""
import numpy as np

from solidify_tables import EDGE_TABLE, TRI_TABLE

# 角点相对格子原点的偏移，编号与查找表一致。
CORNERS = (
    (0, 0, 0),
    (1, 0, 0),
    (1, 1, 0),
    (0, 1, 0),
    (0, 0, 1),
    (1, 0, 1),
    (1, 1, 1),
    (0, 1, 1),
)
# 十二条边：两个角点。
EDGES = (
    (0, 1), (1, 2), (2, 3), (3, 0),
    (4, 5), (5, 6), (6, 7), (7, 4),
    (0, 4), (1, 5), (2, 6), (3, 7),
)
MIN_RADIUS = 0.02
PRINT_MM = 120.0
PITCH = 0.008


class SolidifyError(Exception):
    pass


def _as_chains(payload):
    if isinstance(payload, dict):
        raw = payload.get("chains")
        if raw is None:
            raw = [payload.get("samples") or []]
    else:
        raw = payload
    chains = []
    for chain in raw:
        if chain is None or len(chain) == 0:
            continue
        arr = np.asarray(chain, dtype=np.float64)
        if arr.ndim != 2 or arr.shape[1] < 4:
            raise SolidifyError("中心线的每个点要有位置和半径")
        arr = arr[:, :4].copy()
        if not np.isfinite(arr).all():
            raise SolidifyError("中心线里有无效数字")
        arr[:, 3] = np.maximum(arr[:, 3], MIN_RADIUS)
        chains.append(_decimate(arr, PITCH))
    if not chains or sum(len(c) for c in chains) < 2:
        raise SolidifyError("还没有可以封起来的形体")
    return chains


def _decimate(chain, spacing):
    kept = [chain[0].copy()]
    for point in chain[1:]:
        if np.linalg.norm(point[:3] - kept[-1][:3]) >= spacing:
            kept.append(point.copy())
        elif point[3] > kept[-1][3]:
            kept[-1][3] = point[3]
    if np.linalg.norm(chain[-1][:3] - kept[-1][:3]) > 1e-8:
        kept.append(chain[-1].copy())
    return np.stack(kept)


def _stamp(field, origin, pitch, a, b, ra, rb):
    reach = max(ra, rb)
    lo = np.minimum(a, b) - reach
    hi = np.maximum(a, b) + reach
    i0 = np.floor((lo - origin) / pitch).astype(int)
    i1 = np.ceil((hi - origin) / pitch).astype(int)
    i0 = np.maximum(i0, 0)
    i1 = np.minimum(i1, np.array(field.shape) - 1)
    if np.any(i1 < i0):
        return
    xs = origin[0] + np.arange(i0[0], i1[0] + 1) * pitch
    ys = origin[1] + np.arange(i0[1], i1[1] + 1) * pitch
    zs = origin[2] + np.arange(i0[2], i1[2] + 1) * pitch
    grid = np.stack(np.meshgrid(xs, ys, zs, indexing="ij"), axis=-1)
    ab = b - a
    length2 = float(np.dot(ab, ab))
    if length2 < 1e-12:
        dist = np.linalg.norm(grid - a, axis=-1)
        radius = ra
    else:
        along = np.clip((grid - a) @ ab / length2, 0.0, 1.0)
        closest = a + along[..., None] * ab
        dist = np.linalg.norm(grid - closest, axis=-1)
        radius = ra + along * (rb - ra)
    view = field[i0[0]:i1[0] + 1, i0[1]:i1[1] + 1, i0[2]:i1[2] + 1]
    np.maximum(view, radius - dist, out=view)


def _field(chains, pitch):
    points = np.concatenate([c[:, :3] for c in chains], axis=0)
    radii = np.concatenate([c[:, 3] for c in chains], axis=0)
    reach = float(radii.max())
    pad = reach + pitch * 3.0
    origin = points.min(axis=0) - pad
    hi = points.max(axis=0) + pad
    dims = np.ceil((hi - origin) / pitch).astype(int) + 1
    if int(np.prod(dims)) > 28_000_000:
        raise SolidifyError("形体太大，网格收不下")
    field = np.full(tuple(int(n) for n in dims), -1.0, dtype=np.float32)
    for chain in chains:
        _stamp(field, origin, pitch, chain[0, :3], chain[0, :3], chain[0, 3], chain[0, 3])
        for i in range(len(chain) - 1):
            _stamp(
                field, origin, pitch,
                chain[i, :3], chain[i + 1, :3],
                chain[i, 3], chain[i + 1, 3],
            )
    return field, origin


def _cube_index(field):
    inside = (
        (field[:-1, :-1, :-1] >= 0).astype(np.uint8)
        | ((field[1:, :-1, :-1] >= 0).astype(np.uint8) << 1)
        | ((field[1:, 1:, :-1] >= 0).astype(np.uint8) << 2)
        | ((field[:-1, 1:, :-1] >= 0).astype(np.uint8) << 3)
        | ((field[:-1, :-1, 1:] >= 0).astype(np.uint8) << 4)
        | ((field[1:, :-1, 1:] >= 0).astype(np.uint8) << 5)
        | ((field[1:, 1:, 1:] >= 0).astype(np.uint8) << 6)
        | ((field[:-1, 1:, 1:] >= 0).astype(np.uint8) << 7)
    )
    return np.argwhere((inside != 0) & (inside != 255)), inside


def _march(field, origin, pitch):
    cells, index = _cube_index(field)
    cache = {}
    verts = []
    faces = []

    def vertex(ix, iy, iz, edge):
        c0, c1 = EDGES[edge]
        o0 = CORNERS[c0]
        o1 = CORNERS[c1]
        p0 = (ix + o0[0], iy + o0[1], iz + o0[2])
        p1 = (ix + o1[0], iy + o1[1], iz + o1[2])
        key = (p0, p1) if p0 < p1 else (p1, p0)
        found = cache.get(key)
        if found is not None:
            return found
        v0 = float(field[p0])
        v1 = float(field[p1])
        span = v1 - v0
        t = 0.5 if abs(span) < 1e-8 else (0.0 - v0) / span
        if t < 0.0:
            t = 0.0
        elif t > 1.0:
            t = 1.0
        point = (
            origin[0] + (p0[0] + t * (p1[0] - p0[0])) * pitch,
            origin[1] + (p0[1] + t * (p1[1] - p0[1])) * pitch,
            origin[2] + (p0[2] + t * (p1[2] - p0[2])) * pitch,
        )
        cache[key] = len(verts)
        verts.append(point)
        return cache[key]

    for ix, iy, iz in cells:
        cube = int(index[ix, iy, iz])
        row = TRI_TABLE[cube]
        e = 0
        while e < 16 and row[e] != -1:
            faces.append((
                vertex(ix, iy, iz, row[e]),
                vertex(ix, iy, iz, row[e + 1]),
                vertex(ix, iy, iz, row[e + 2]),
            ))
            e += 3
    if not faces:
        raise SolidifyError("没有生成出外壳")
    return np.asarray(verts, dtype=np.float64), np.asarray(faces, dtype=np.int64)


def _collapse_short(verts, faces, tol):
    """只沿极短的边合并端点。不相连的两块即使挨得很近也不会被焊在一起。"""
    parent = np.arange(len(verts), dtype=np.int64)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    pairs = ((0, 1), (1, 2), (2, 0))
    tri = verts[faces]
    for i, j in pairs:
        short = np.flatnonzero(np.linalg.norm(tri[:, j] - tri[:, i], axis=1) < tol)
        for n in short:
            ra = find(int(faces[n, i]))
            rb = find(int(faces[n, j]))
            if ra != rb:
                parent[rb] = ra
    roots = np.fromiter((find(i) for i in range(len(verts))), dtype=np.int64, count=len(verts))
    uniq, inverse = np.unique(roots, return_inverse=True)
    mapped = inverse[faces]
    keep = (
        (mapped[:, 0] != mapped[:, 1])
        & (mapped[:, 1] != mapped[:, 2])
        & (mapped[:, 2] != mapped[:, 0])
    )
    mapped = mapped[keep]
    order = np.sort(mapped, axis=1)
    _, unique_faces = np.unique(order, axis=0, return_index=True)
    mapped = mapped[np.sort(unique_faces)]
    used = np.unique(mapped)
    remap = np.full(len(uniq), -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    return verts[uniq][used], remap[mapped]


def _signed_volume(verts, faces):
    tri = verts[faces]
    cross = np.cross(tri[:, 1], tri[:, 2])
    return float(np.einsum("ij,ij->", tri[:, 0], cross) / 6.0)


def _components(faces):
    parent = np.arange(len(faces), dtype=np.int64)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    edges = np.sort(np.stack((
        faces[:, [0, 1]],
        faces[:, [1, 2]],
        faces[:, [2, 0]],
    ), axis=1).reshape(-1, 2), axis=1)
    owners = np.repeat(np.arange(len(faces)), 3)
    order = np.lexsort((edges[:, 1], edges[:, 0]))
    edges = edges[order]
    owners = owners[order]
    same = np.all(edges[1:] == edges[:-1], axis=1)
    pair = np.flatnonzero(same)
    for i in pair:
        union(int(owners[i]), int(owners[i + 1]))
    roots = {find(i) for i in range(len(faces))}
    uniq, counts = np.unique(edges, axis=0, return_counts=True)
    boundary = int(np.sum(counts == 1))
    pinched = int(np.sum(counts > 2))
    return boundary, pinched, len(roots), int(len(uniq))


def _scale_mm(verts):
    span = verts.max(axis=0) - verts.min(axis=0)
    longest = float(span.max())
    if longest <= 0:
        raise SolidifyError("形体没有体积")
    scale = PRINT_MM / longest
    return verts * scale, scale


def _obj(verts, faces):
    lines = [
        "# Ink Sound Form",
        "# One closed mesh. Units: millimetres. Longest side: %.0f mm." % PRINT_MM,
        "o Ink-Sound-Form",
    ]
    for x, y, z in verts:
        lines.append("v %.5f %.5f %.5f" % (x, y, z))
    # OBJ 面序号从 1 开始。法线朝外。
    for a, b, c in faces:
        lines.append("f %d %d %d" % (a + 1, b + 1, c + 1))
    return "\n".join(lines) + "\n"


def solidify(payload, pitch=PITCH):
    chains = _as_chains(payload)
    field, origin = _field(chains, pitch)
    verts, faces = _march(field, origin, pitch)
    # 只收掉短于网格步长百分之一的边，避免写出长度为 0 的边。
    verts, faces = _collapse_short(verts, faces, pitch * 0.01)
    volume = _signed_volume(verts, faces)
    if volume < 0:
        faces = faces[:, ::-1]
        volume = -volume
    boundary, pinched, parts, edges = _components(faces)
    if boundary or pinched or parts != 1 or volume <= 0:
        raise SolidifyError(
            "收出来的网格不能打印：开口 %d，叠边 %d，分开的块 %d。"
            % (boundary, pinched, parts)
        )
    verts, scale = _scale_mm(verts)
    thin = MIN_RADIUS * 2.0 * scale
    return {
        "obj": _obj(verts, faces),
        "triangles": int(len(faces)),
        "vertices": int(len(verts)),
        "boundary": boundary,
        "pinched": pinched,
        "components": parts,
        "edges": edges,
        "volume_mm3": volume * (scale ** 3),
        "thin_mm": thin,
        "print_mm": PRINT_MM,
    }
