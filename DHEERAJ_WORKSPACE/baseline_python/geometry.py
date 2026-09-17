"""Small, dependency-free planar geometry helpers. Distances use sheet units."""
from math import hypot


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def cross(a, b):
    return a[0] * b[1] - a[1] * b[0]


def area(poly):
    return sum(cross(a, b) for a, b in zip(poly, poly[1:] + poly[:1])) / 2


def line(a, b):
    dx, dy = sub(b, a)
    size = hypot(dx, dy)
    if size < 1e-12:
        raise ValueError("Zero-length edge")
    nx, ny = -dy / size, dx / size
    d = nx * a[0] + ny * a[1]
    if nx < -1e-10 or (abs(nx) <= 1e-10 and ny < 0):
        nx, ny, d = -nx, -ny, -d
    return (nx, ny, d)


def distance(p, axis):
    return p[0] * axis[0] + p[1] * axis[1] - axis[2]


IDENTITY = (1., 0., 0., 1., 0., 0.)


def transform(t, p):
    a, b, c, d, x, y = t
    return (a * p[0] + b * p[1] + x, c * p[0] + d * p[1] + y)


def compose(t, u):
    a, b, c, d, x, y = t
    e, f, g, h, v, w = u
    return (a*e+b*g, a*f+b*h, c*e+d*g, c*f+d*h,
            a*v+b*w+x, c*v+d*w+y)


def inverse(t):
    a, b, c, d, x, y = t
    return (a, c, b, d, -a*x-c*y, -b*x-d*y)


def parity(t):
    return 1 if t[0]*t[3] - t[1]*t[2] > 0 else -1


def reflection(axis):
    x, y, d = axis
    return (1-2*x*x, -2*x*y, -2*x*y, 1-2*y*y, 2*d*x, 2*d*y)


def triangulate(poly):
    """Ear clipping returns local vertex indices; reject degenerate polygons."""
    ids = list(range(len(poly)))
    if area(poly) < 0:
        ids.reverse()
    triangles = []
    while len(ids) > 3:
        for j, b in enumerate(ids):
            a, c = ids[j-1], ids[(j+1) % len(ids)]
            if cross(sub(poly[b], poly[a]), sub(poly[c], poly[b])) <= 1e-12:
                continue
            def inside(p):
                return all(cross(sub(poly[v], poly[u]), sub(p, poly[u])) >= -1e-12
                           for u, v in ((a, b), (b, c), (c, a)))
            if any(inside(poly[k]) for k in ids if k not in (a, b, c)):
                continue
            triangles.append((a, b, c))
            ids.pop(j)
            break
        else:
            # A collinear boundary subdivision is not a separate ear.
            for j, b in enumerate(ids):
                a, c = ids[j-1], ids[(j+1) % len(ids)]
                if abs(cross(sub(poly[b], poly[a]), sub(poly[c], poly[b]))) < 1e-12:
                    ids.pop(j)
                    break
            else:
                raise ValueError("Face is not a simple polygon")
    if len(ids) != 3 or abs(area([poly[k] for k in ids])) < 1e-12:
        raise ValueError("Degenerate face")
    triangles.append(tuple(ids))
    return triangles


def triangle_overlap(a, b, eps):
    # Strict separating-axis test: touching boundaries are not interior overlap.
    for poly in (a, b):
        for p, q in zip(poly, poly[1:] + poly[:1]):
            axis = line(p, q)
            pa = [distance(v, axis) for v in a]
            pb = [distance(v, axis) for v in b]
            if min(max(pa), max(pb)) - max(min(pa), min(pb)) <= eps:
                return False
    return True


def overlap(a, ta, b, tb, eps):
    return any(triangle_overlap([a[i] for i in ia], [b[i] for i in ib], eps)
               for ia in ta for ib in tb)
