"""Discrete, zero-thickness flat-fold model on a fixed final-CP face mesh.

No intermediate demonstration frames enter this module. A move rotates a union
of exposed hinge-connected flaps by 180 degrees, above or below the plane.
This is a restricted simple-fold model, not a general origami physics solver.
"""
from dataclasses import dataclass
from itertools import combinations
from math import hypot, isfinite

from geometry import (IDENTITY, area, compose, distance, inverse, line, overlap,
                      parity, reflection, transform, triangulate)


class InputError(ValueError):
    pass


@dataclass(frozen=True)
class State:
    transforms: tuple
    stack: tuple                 # bottom to top, including nonoverlapping faces
    creased: frozenset


@dataclass(frozen=True)
class Action:
    axis: tuple                  # nx*x + ny*y = d, in current canonical frame
    moving: tuple                # face IDs in the input CP
    direction: str               # over / under
    hinges: tuple

    def as_dict(self):
        return {"axis": list(self.axis), "moving_faces": list(self.moving),
                "direction": self.direction, "hinge_edges": list(self.hinges),
                "angle_degrees": 180}


class Problem:
    def __init__(self, cp, target, tolerance=0.004, convention="pureland"):
        if not isfinite(tolerance) or tolerance <= 0:
            raise InputError("tolerance must be positive and finite")
        if convention not in ("pureland", "fold"):
            raise InputError("Unknown layer convention")
        self.eps = tolerance
        self.convention = convention
        for label, data in (("CP", cp), ("target", target)):
            if data.get("file_frames"):
                raise InputError(f"{label}: supply a single resolved frame, not file_frames")
        try:
            self.vertices = tuple(tuple(float(x) for x in p) for p in cp["vertices_coords"])
            self.edges = tuple(tuple(e) for e in cp["edges_vertices"])
            self.faces = tuple(tuple(f) for f in cp["faces_vertices"])
        except (KeyError, TypeError, ValueError) as exc:
            raise InputError("CP needs vertices_coords, edges_vertices, faces_vertices") from exc
        if not self.faces or not self.vertices:
            raise InputError("Empty mesh")
        if any(len(p) != 2 or not all(isfinite(x) for x in p) for p in self.vertices):
            raise InputError("CP coordinates must be finite 2D material coordinates")
        nv = len(self.vertices)
        for e in self.edges:
            if len(e) != 2 or any(type(v) is not int or not 0 <= v < nv for v in e):
                raise InputError("Invalid edge vertex index")
        for face in self.faces:
            if len(face) < 3 or len(set(face)) != len(face) or any(
                    type(v) is not int or not 0 <= v < nv for v in face):
                raise InputError("Faces must be simple polygons with valid vertex indices")
        self.polys = [[self.vertices[v] for v in f] for f in self.faces]
        try:
            self.triangles = [triangulate(p) for p in self.polys]
        except ValueError as exc:
            raise InputError(str(exc)) from exc
        signs = [1 if area(p) > 0 else -1 for p in self.polys]
        if len(set(signs)) != 1:
            raise InputError("Face winding must be consistent across the CP")
        # Pureland's exporter uses material +Z even with clockwise polygons.
        self.material_normal = 1 if convention == "pureland" else signs[0]
        self.winding = signs[0]
        lookup = {tuple(sorted(e)): i for i, e in enumerate(self.edges)}
        if len(lookup) != len(self.edges):
            raise InputError("Duplicate mesh edges")
        self.incident = [[] for _ in self.edges]
        for f, face in enumerate(self.faces):
            for a, b in zip(face, face[1:] + face[:1]):
                if tuple(sorted((a, b))) not in lookup:
                    raise InputError("Face boundary missing from edges_vertices")
                self.incident[lookup[tuple(sorted((a, b)))]].append(f)
        if any(len(fs) not in (1, 2) for fs in self.incident):
            raise InputError("Need a manifold mesh with no unused edges")
        self.adjacency = [[] for _ in self.faces]
        for e, fs in enumerate(self.incident):
            a, b = (self.vertices[v] for v in self.edges[e])
            if hypot(a[0]-b[0], a[1]-b[1]) < 1e-10:
                raise InputError("Zero-length edge")
            if len(fs) == 2:
                f, g = fs
                self.adjacency[f].append((g, e))
                self.adjacency[g].append((f, e))
        visited, todo = set(), [0]
        while todo:
            f = todo.pop()
            if f not in visited:
                visited.add(f)
                todo.extend(g for g, _ in self.adjacency[f])
        if len(visited) != len(self.faces):
            raise InputError("Disconnected sheets are unsupported")
        for f in range(len(self.faces)):
            for g in range(f):
                if overlap(self.polys[f], self.triangles[f], self.polys[g],
                           self.triangles[g], 1e-8):
                    raise InputError("CP faces overlap in material coordinates")
        self.cp_assignments = tuple(cp.get("edges_assignment", ["U"] * len(self.edges)))
        if len(self.cp_assignments) != len(self.edges):
            raise InputError("CP assignment count differs from edge count")
        if any(a not in ("B", "M", "V", "F", "U", "J") for a in self.cp_assignments):
            raise InputError("Only B/M/V/F/U/J edges are supported (no cuts)")
        for e, fs in enumerate(self.incident):
            if (len(fs) == 1) != (self.cp_assignments[e] == "B"):
                raise InputError("Boundary assignments do not match face topology")
        self.hinges = tuple(e for e, fs in enumerate(self.incident)
                            if len(fs) == 2 and self.cp_assignments[e] != "J")
        self.required = frozenset(self.hinges)
        self._read_target(target)
        self.initial = State(tuple(IDENTITY for _ in self.faces),
                             tuple(range(len(self.faces))), frozenset())

    def _read_target(self, target):
        # IDs must align: silently comparing different tessellations is invalid.
        for name, expected in (("edges_vertices", self.edges), ("faces_vertices", self.faces)):
            if name in target and tuple(tuple(x) for x in target[name]) != expected:
                raise InputError(f"Target {name} must use the CP's topology and IDs")
        assignments = target.get("edges_assignment")
        angles = target.get("edges_foldAngle")
        if assignments is None and angles is None:
            raise InputError("Target needs edges_assignment or edges_foldAngle")
        n = len(self.edges)
        if assignments is not None and len(assignments) != n:
            raise InputError("Target assignment count differs from CP")
        if angles is not None and len(angles) != n:
            raise InputError("Target fold-angle count differs from CP")
        self.goal_assignment = []
        for e in range(n):
            a = assignments[e] if assignments is not None else "U"
            if a not in ("B", "M", "V", "F", "U", "J"):
                raise InputError("Unsupported target edge assignment")
            if angles is not None:
                angle = angles[e]
                if not isinstance(angle, (int, float)) or not isfinite(angle):
                    raise InputError("Target angles must be finite numbers")
                if min(abs(angle), abs(angle-180), abs(angle+180)) > 1e-5:
                    raise InputError("Only flat states (0 or +/-180 degrees) are supported")
                derived = "F" if abs(angle) < 1e-5 else ("V" if angle > 0 else "M")
                if a in ("M", "V") and a != derived:
                    raise InputError("Target assignments and fold angles disagree")
                if a in ("B", "J", "F") and derived != "F":
                    raise InputError("A boundary/join/flat target edge has a nonzero angle")
                a = derived
            if len(self.incident[e]) == 1 or self.cp_assignments[e] == "J":
                if a in ("M", "V"):
                    raise InputError("Cannot fold a boundary or join edge")
                a = "F"
            self.goal_assignment.append(a)
        self.orders = []
        for triple in target.get("faceOrders", []):
            if len(triple) != 3:
                raise InputError("faceOrders entries must be triples")
            f, g, s = triple
            if (type(f) is not int or type(g) is not int or f == g or
                    not 0 <= f < len(self.faces) or not 0 <= g < len(self.faces)
                    or s not in (-1, 0, 1)):
                raise InputError("Invalid faceOrders entry")
            if s:
                self.orders.append((f, g, s))
        # Reconstruct final geometry from angles on the dual graph. Root face is
        # fixed, so comparison is invariant to global pose, but not material IDs.
        self.target_transforms = None
        if "U" not in self.goal_assignment:
            transforms = [None] * len(self.faces)
            transforms[0] = IDENTITY
            todo = [0]
            while todo:
                f = todo.pop()
                for g, e in self.adjacency[f]:
                    t = transforms[f]
                    if self.goal_assignment[e] in ("M", "V"):
                        a, b = (transform(t, self.vertices[v]) for v in self.edges[e])
                        t = compose(reflection(line(a, b)), t)
                    if transforms[g] is None:
                        transforms[g] = t
                        todo.append(g)
                    elif any(hypot(*(x-y for x, y in zip(transform(t, p),
                                      transform(transforms[g], p)))) > self.eps
                             for p in self.polys[g]):
                        raise InputError("Target angles do not close geometrically within tolerance")
            self.target_transforms = tuple(transforms)
            self.vertex_positions(State(self.target_transforms, (), frozenset()))
        # A standard foldedForm may additionally specify actual folded coords.
        # Pureland cp.fold stores material coordinates here, so never treat those
        # as the folded target unless explicitly declared.
        classes = target.get("frame_classes", []) + target.get("file_classes", [])
        if "foldedForm" not in classes and "vertices_coords" in target:
            coords = target["vertices_coords"]
            if len(coords) != len(self.vertices) or any(
                    len(p) != 2 or not all(isinstance(x, (int, float)) and isfinite(x) for x in p)
                    for p in coords):
                raise InputError("Target material coordinates must match the CP's 2D vertices")
            if any(hypot(p[0]-q[0], p[1]-q[1]) > self.eps for p, q in zip(coords, self.vertices)):
                raise InputError("Target material coordinates differ from CP; folded coordinates need foldedForm")
        if "foldedForm" in classes and "vertices_coords" in target:
            coords = target["vertices_coords"]
            if len(coords) != len(self.vertices) or any(len(p) != 2 for p in coords):
                raise InputError("Only planar 2D foldedForm coordinates are supported")
            if self.target_transforms is None:
                raise InputError("foldedForm coordinates require resolved target angles")
            # Compare all labelled pair distances: global rigid pose is irrelevant.
            predicted = self.vertex_positions(State(self.target_transforms, (), frozenset()))
            for i in range(len(coords)):
                if not all(isinstance(x, (int, float)) and isfinite(x) for x in coords[i]):
                    raise InputError("Nonfinite target coordinates")
                for j in range(i):
                    actual = hypot(coords[i][0]-coords[j][0], coords[i][1]-coords[j][1])
                    expected = hypot(predicted[i][0]-predicted[j][0], predicted[i][1]-predicted[j][1])
                    if abs(actual-expected) > self.eps:
                        raise InputError("Target folded coordinates disagree with target angles")
        # The chosen model requires a global stack. Reject a known cyclic target
        # explicitly rather than spending a search budget on an impossible order.
        if self.convention == "pureland" or self.target_transforms is not None:
            above = [set() for _ in self.faces]
            indegree = [0] * len(self.faces)
            for f, g, s in self.orders:
                normal = 1 if self.convention == "pureland" else self.winding * parity(self.target_transforms[g])
                low, high = (g, f) if s*normal > 0 else (f, g)
                if high not in above[low]:
                    above[low].add(high)
                    indegree[high] += 1
            todo = [f for f, degree in enumerate(indegree) if degree == 0]
            count = 0
            while todo:
                f = todo.pop()
                count += 1
                for g in above[f]:
                    indegree[g] -= 1
                    if indegree[g] == 0:
                        todo.append(g)
            if count != len(self.faces):
                raise InputError("Target layer order is cyclic; a global stack cannot represent it")

    def polygons(self, state):
        return [[transform(t, p) for p in poly] for t, poly in zip(state.transforms, self.polys)]

    def vertex_positions(self, state):
        out = [None] * len(self.vertices)
        for f, face in enumerate(self.faces):
            for v in face:
                p = transform(state.transforms[f], self.vertices[v])
                if out[v] is not None and hypot(p[0]-out[v][0], p[1]-out[v][1]) > self.eps:
                    raise InputError("Fold tears a shared vertex beyond tolerance")
                if out[v] is None:
                    out[v] = p
        if any(p is None for p in out):
            raise InputError("Unused vertex")
        return out

    def assignments(self, state):
        rank = {f: i for i, f in enumerate(state.stack)}
        values = []
        for e, fs in enumerate(self.incident):
            if len(fs) == 1:
                values.append("B")
                continue
            f, g = fs
            if parity(state.transforms[f]) == parity(state.transforms[g]):
                values.append("J" if self.cp_assignments[e] == "J" else "F")
            else:
                normal = self.material_normal * parity(state.transforms[f])
                values.append("V" if (rank[g]-rank[f])*normal > 0 else "M")
        return values

    def is_goal(self, state):
        if not self.required.issubset(state.creased):
            return False
        actual = self.assignments(state)
        for e in range(len(self.edges)):
            want = self.goal_assignment[e]
            got = "F" if actual[e] in ("B", "J") else actual[e]
            if want != "U" and got != want:
                return False
        if self.target_transforms is not None:
            for f, poly in enumerate(self.polys):
                for p in poly:
                    a, b = transform(state.transforms[f], p), transform(self.target_transforms[f], p)
                    if hypot(a[0]-b[0], a[1]-b[1]) > self.eps:
                        return False
        rank = {f: i for i, f in enumerate(state.stack)}
        for f, g, sign in self.orders:
            normal = 1 if self.convention == "pureland" else self.winding * parity(state.transforms[g])
            if (rank[f]-rank[g])*normal*sign <= 0:
                return False
        return True

    def key(self, state):
        # Quantization is an explicitly approximate numerical equivalence, not
        # an exact mathematical reachability certificate.
        quantum = self.eps / 8
        coords = tuple(round(x / quantum) for poly in self.polygons(state) for p in poly for x in p)
        return (coords, tuple(parity(t) for t in state.transforms), state.stack, state.creased)

    def actions(self, state):
        """Enumerate all nonempty unions of same-side components of a line cut."""
        polys = self.polygons(state)
        axes = []
        for e in self.hinges:
            f = self.incident[e][0]
            a, b = (transform(state.transforms[f], self.vertices[v]) for v in self.edges[e])
            axis = line(a, b)
            if not any(max(abs(distance(a, old)), abs(distance(b, old))) <= self.eps
                       and abs(axis[0]*old[1]-axis[1]*old[0]) < self.eps for old in axes):
                axes.append(axis)
        for axis in axes:
            cut = set()
            for e in self.hinges:
                f = self.incident[e][0]
                if all(abs(distance(transform(state.transforms[f], self.vertices[v]), axis)) <= self.eps
                       for v in self.edges[e]):
                    cut.add(e)
            components, seen = [], set()
            for root in range(len(self.faces)):
                if root in seen:
                    continue
                group, todo = set(), [root]
                while todo:
                    f = todo.pop()
                    if f in group:
                        continue
                    group.add(f)
                    todo.extend(g for g, e in self.adjacency[f] if e not in cut and g not in group)
                seen.update(group)
                ds = [distance(p, axis) for f in group for p in polys[f]]
                side = 1 if min(ds) >= -self.eps and max(ds) > self.eps else (
                    -1 if max(ds) <= self.eps and min(ds) < -self.eps else 0)
                components.append((group, side))
            for side in (1, -1):
                groups = [g for g, s in components if s == side]
                # Deterministic ordering, independent of demonstration frames.
                for size in range(1, len(groups)+1):
                    for selected in combinations(groups, size):
                        moving = frozenset().union(*selected)
                        if len(moving) == len(self.faces):
                            continue
                        hinges = tuple(sorted(e for e in cut if
                            (self.incident[e][0] in moving) != (self.incident[e][1] in moving)))
                        if not hinges:
                            continue
                        for direction in ("over", "under"):
                            yield Action(axis, tuple(sorted(moving)), direction, hinges)

    def apply(self, state, action):
        moving = set(action.moving)
        if not moving or len(moving) == len(self.faces) or action.direction not in ("over", "under"):
            return None
        if any(type(f) is not int or not 0 <= f < len(self.faces) for f in moving):
            return None
        if len(action.axis) != 3 or not all(isfinite(x) for x in action.axis):
            return None
        if abs(hypot(*action.axis[:2])-1) > 1e-6:
            return None
        polys = self.polygons(state)
        ds = [distance(p, action.axis) for f in moving for p in polys[f]]
        if min(ds) < -self.eps and max(ds) > self.eps:
            return None
        if max(abs(d) for d in ds) <= self.eps:
            return None
        hinges = []
        for e, fs in enumerate(self.incident):
            if len(fs) == 2 and ((fs[0] in moving) != (fs[1] in moving)):
                if e not in self.hinges or any(abs(distance(transform(state.transforms[fs[0]],
                        self.vertices[v]), action.axis)) > self.eps for v in self.edges[e]):
                    return None
                hinges.append(e)
        if not hinges or tuple(hinges) != action.hinges:
            return None
        ranks = {f: i for i, f in enumerate(state.stack)}
        for f in moving:
            for g in range(len(self.faces)):
                if g in moving:
                    continue
                blocked = ranks[f] < ranks[g] if action.direction == "over" else ranks[f] > ranks[g]
                if blocked and overlap(polys[f], self.triangles[f], polys[g], self.triangles[g], 1e-8):
                    return None
        r = reflection(action.axis)
        transforms = tuple(compose(r, t) if f in moving else t for f, t in enumerate(state.transforms))
        stationary = tuple(f for f in state.stack if f not in moving)
        lifted = tuple(f for f in reversed(state.stack) if f in moving)
        stack = stationary + lifted if action.direction == "over" else lifted + stationary
        # Factor out a rigid whole-sheet motion. Reflecting the global frame also
        # reverses its Z axis, hence the stack reversal; M/V remains invariant.
        root_inverse = inverse(transforms[0])
        transforms = tuple(compose(root_inverse, t) for t in transforms)
        if parity(root_inverse) < 0:
            stack = tuple(reversed(stack))
        result = State(transforms, stack, state.creased | frozenset(hinges))
        try:
            self.vertex_positions(result)
        except InputError:
            return None
        return result

    def frame(self, state):
        polys = self.polygons(state)
        ranks = {f: i for i, f in enumerate(state.stack)}
        orders = []
        for f in range(len(self.faces)):
            for g in range(f):
                if overlap(polys[f], self.triangles[f], polys[g], self.triangles[g], 1e-8):
                    normal = self.winding * parity(state.transforms[g])
                    orders.append([f, g, normal * (1 if ranks[f] > ranks[g] else -1)])
        assignments = self.assignments(state)
        # Export angles with standard FOLD winding, even for clockwise Pureland input.
        if self.convention == "pureland" and self.winding < 0:
            assignments = [{"M": "V", "V": "M"}.get(a, a) for a in assignments]
        return {"file_spec": 1.2, "file_creator": "baseline_python",
                "frame_classes": ["foldedForm"], "frame_attributes": ["2D"],
                "vertices_coords": self.vertex_positions(state),
                "edges_vertices": self.edges, "faces_vertices": self.faces,
                "edges_assignment": assignments,
                "edges_foldAngle": [{"M": -180, "V": 180}.get(a, 0) for a in assignments],
                "faceOrders": orders, "baseline_creased_edges": sorted(state.creased),
                "baseline_stack_bottom_to_top": state.stack}
