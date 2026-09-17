"""Run: python3 -m unittest discover -s DHEERAJ_WORKSPACE/baseline_python -v"""
import copy
import json
from pathlib import Path
import unittest

from geometry import area, overlap, triangulate
from model import Action, InputError, Problem, State
from search import Limits, search


def half_sheet(assignment="V", orders=None):
    # A 2 x 1 rectangle divided at x=1, counterclockwise faces.
    return {"vertices_coords": [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
            "edges_vertices": [[0, 1], [1, 2], [2, 5], [5, 4], [4, 3], [3, 0], [1, 4]],
            "faces_vertices": [[0, 1, 4, 3], [1, 2, 5, 4]],
            "edges_assignment": ["B"]*6 + [assignment],
            "edges_foldAngle": [0]*6 + [{"V": 180, "M": -180, "F": 0}[assignment]],
            "faceOrders": orders if orders is not None else [[1, 0, 1 if assignment == "V" else -1]]}


class GraphProblem:
    """Independent search fixture: actions are explicit destination labels."""
    initial = "S"

    def __init__(self, graph, goal="G"):
        self.graph, self.goal = graph, goal

    def key(self, state):
        return state

    def is_goal(self, state):
        return state == self.goal

    def actions(self, state):
        return iter(self.graph.get(state, ()))

    def apply(self, state, action):
        return action if action in self.graph.get(state, ()) else None


class SearchTests(unittest.TestCase):
    def test_bfs_shortest_and_dfs_depth_first(self):
        graph = GraphProblem({"S": ["A", "B"], "A": ["C"], "C": ["G"], "B": ["G"]})
        bfs, dfs = search(graph, "bfs"), search(graph, "dfs")
        self.assertEqual(bfs.states, ["S", "B", "G"])
        self.assertEqual(dfs.states, ["S", "A", "C", "G"])
        self.assertTrue(bfs.replay_verified)

    def test_dfs_reopens_shallower_state(self):
        graph = GraphProblem({"S": ["A", "X"], "A": ["B"], "B": ["X"], "X": ["Y"], "Y": ["G"]})
        result = search(graph, "dfs", Limits(max_depth=3))
        self.assertEqual(result.states, ["S", "X", "Y", "G"])

    def test_cycles_exhaust(self):
        for algorithm in ("bfs", "dfs"):
            result = search(GraphProblem({"S": ["A"], "A": ["S"]}), algorithm)
            self.assertEqual(result.status, "EXHAUSTED_MODEL")

    def test_limits_are_not_exhaustion(self):
        graph = GraphProblem({"S": ["A"], "A": ["G"]})
        for algorithm in ("bfs", "dfs"):
            self.assertEqual(search(graph, algorithm, Limits(max_depth=1)).status, "DEPTH_LIMIT")
            self.assertEqual(search(graph, algorithm, Limits(max_queries=1)).status, "QUERY_LIMIT")
            self.assertEqual(search(graph, algorithm, Limits(max_states=1)).status, "STATE_LIMIT")


class FoldingTests(unittest.TestCase):
    def test_real_pureland_snapshot_two_folds(self):
        path = Path(__file__).parent / "fixtures" / "ladybug_step_04.fold"
        data = json.loads(path.read_text())
        problem = Problem(data, data, tolerance=1e-6)
        for algorithm in ("bfs", "dfs"):
            result = search(problem, algorithm, Limits(max_depth=2))
            self.assertEqual(result.status, "SOLVED")
            self.assertEqual(len(result.actions), 2)
            self.assertTrue(result.replay_verified)

    def test_known_one_fold_targets(self):
        for direction in ("M", "V"):
            data = half_sheet(direction)
            for algorithm in ("bfs", "dfs"):
                problem = Problem(data, data, tolerance=1e-6)
                result = search(problem, algorithm, Limits(max_depth=1))
                self.assertEqual(result.status, "SOLVED")
                self.assertEqual(len(result.actions), 1)
                self.assertTrue(problem.is_goal(result.states[-1]))
                self.assertEqual(problem.assignments(result.states[-1])[-1], direction)

    def test_layer_order_is_part_of_goal(self):
        data = half_sheet()
        problem = Problem(data, data, tolerance=1e-6)
        result = search(problem, "bfs", Limits(max_depth=1))
        solved = result.states[-1]
        wrong = State(solved.transforms, tuple(reversed(solved.stack)), solved.creased)
        self.assertFalse(problem.is_goal(wrong))
        # Hold assignments unconstrained, to test order without M/V failing first.
        problem.goal_assignment[-1] = "U"
        self.assertFalse(problem.is_goal(wrong))

    def test_precrease_requires_fold_and_unfold(self):
        data = half_sheet("F", orders=[])
        problem = Problem(data, data, tolerance=1e-6)
        self.assertFalse(problem.is_goal(problem.initial))
        result = search(problem, "bfs", Limits(max_depth=2))
        self.assertEqual(result.status, "SOLVED")
        self.assertEqual(len(result.actions), 2)
        self.assertEqual(problem.assignments(result.states[-1])[-1], "F")

    def test_history_changes_state_key(self):
        data = half_sheet()
        problem = Problem(data, data)
        root = problem.initial
        self.assertNotEqual(problem.key(root), problem.key(State(root.transforms, root.stack, frozenset({6}))))

    def test_nonhinge_move_rejected(self):
        data = half_sheet()
        problem = Problem(data, data)
        self.assertIsNone(problem.apply(problem.initial, Action((1, 0, 0.5), (1,), "over", (6,))))

    def test_buried_layer_cannot_pass_through_top_layer(self):
        data = half_sheet()
        problem = Problem(data, data, tolerance=1e-6)
        folded = problem.apply(problem.initial, Action((1, 0, 1), (1,), "over", (6,)))
        self.assertIsNotNone(folded)
        # Face 0 is now beneath face 1 on the same side of the hinge.
        self.assertIsNone(problem.apply(folded, Action((1, 0, 1), (0,), "over", (6,))))
        self.assertIsNotNone(problem.apply(folded, Action((1, 0, 1), (0,), "under", (6,))))

    def test_topology_mismatch_rejected(self):
        data = half_sheet()
        target = copy.deepcopy(data)
        target["faces_vertices"].reverse()
        with self.assertRaises(InputError):
            Problem(data, target)

    def test_material_coordinates_mismatch_rejected(self):
        data = half_sheet()
        target = copy.deepcopy(data)
        target["vertices_coords"][0][0] += 0.1
        with self.assertRaises(InputError):
            Problem(data, target)

    def test_cyclic_global_layer_order_rejected(self):
        data = half_sheet(orders=[[0, 1, 1], [1, 0, 1]])
        with self.assertRaisesRegex(InputError, "cyclic"):
            Problem(data, data)

    def test_nonflat_target_rejected(self):
        data = half_sheet()
        data["edges_foldAngle"][-1] = 90
        with self.assertRaises(InputError):
            Problem(data, data)

    def test_export_uses_standard_normal_relative_order(self):
        data = half_sheet()
        problem = Problem(data, data, tolerance=1e-6)
        result = search(problem, "bfs", Limits(max_depth=1))
        frame = problem.frame(result.states[-1])
        standard = Problem(data, frame, tolerance=1e-6, convention="fold")
        self.assertTrue(standard.is_goal(result.states[-1]))
        self.assertEqual(len(frame["faceOrders"]), 1)

    def test_clockwise_pureland_export_converts_assignment_convention(self):
        data = half_sheet()
        data["faces_vertices"] = [list(reversed(f)) for f in data["faces_vertices"]]
        problem = Problem(data, data, tolerance=1e-6)
        result = search(problem, "bfs", Limits(max_depth=1))
        frame = problem.frame(result.states[-1])
        self.assertEqual(frame["edges_assignment"][-1], "M")
        standard = Problem(data, frame, tolerance=1e-6, convention="fold")
        self.assertTrue(standard.is_goal(result.states[-1]))

    def test_concave_polygon_geometry(self):
        poly = [(0, 0), (2, 0), (2, 1), (1, 1), (1, 2), (0, 2)]
        triangles = triangulate(poly)
        self.assertAlmostEqual(sum(abs(area([poly[i] for i in t])) for t in triangles), 3)
        empty_corner = [(1.2, 1.2), (1.8, 1.2), (1.8, 1.8), (1.2, 1.8)]
        self.assertFalse(overlap(poly, triangles, empty_corner, triangulate(empty_corner), 1e-8))


if __name__ == "__main__":
    unittest.main()
