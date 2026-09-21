"""Action equality for legacy indexed folds and arbitrary-angle partial folds."""
import math


def same_action(a, b):
    def signature(f):
        line = f.get("line")
        if line is not None:
            nx, ny = line["n"]
            offset = line["d"]
        elif f.get("angle_index") is not None:
            nx, ny = [(0, 1), (-1, 1), (1, 0), (1, 1)][f["angle_index"]]
            offset = f["offset"]
        elif f.get("angle_degrees") is not None:
            theta = math.radians(f["angle_degrees"] % 360)
            nx, ny = -math.sin(theta), math.cos(theta)
            offset = f["offset"]
        else:
            nx, ny = f["normal"]
            offset = f["offset"]
        length = math.hypot(nx, ny)
        side = 1 if f.get("move_positive", f.get("movePositive")) else -1
        # Orient the normal toward the moving half-plane, making equivalent
        # line spellings compare equally even when both normal and side flip.
        geometry = (side * nx / length, side * ny / length, side * offset / length)
        selection = f.get("selection", f.get("sel")) or {"mode": f.get("selection_mode", "all"),
                                                       "k": f.get("layer_count")}
        mode = selection["mode"]
        return geometry, (mode, selection.get("k") if mode != "all" else None, f.get("over", True))

    ga, sa = signature(a)
    gb, sb = signature(b)
    return sa == sb and all(abs(x - y) < 2e-6 for x, y in zip(ga, gb))
