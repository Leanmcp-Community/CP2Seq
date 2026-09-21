import math
import unittest
from action_compare import same_action


class ActionComparisonTests(unittest.TestCase):
    def test_equivalent_line_spellings(self):
        indexed = dict(angle_index=1, offset=.5, move_positive=True, over=True)
        arbitrary = dict(angle_degrees=45, offset=.5 / math.sqrt(2), move_positive=True, over=True)
        self.assertTrue(same_action(indexed, arbitrary))
        self.assertTrue(same_action(indexed, dict(line={"n": [1, -1], "d": -.5},
                                                 movePositive=False, over=True)))

    def test_partial_selection_changes_action(self):
        base = dict(angle_degrees=35, offset=.1, move_positive=True, over=True)
        top = dict(base, selection_mode="top", layer_count=3)
        self.assertFalse(same_action(base, top))
        self.assertTrue(same_action(top, dict(base, selection={"mode": "top", "k": 3})))
        self.assertFalse(same_action(top, dict(top, layer_count=2)))


if __name__ == "__main__":
    unittest.main()
