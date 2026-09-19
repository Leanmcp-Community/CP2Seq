"""Regression fixtures for the observed repetitive Qwen output. No API calls."""
import unittest
from repetition_guard import detect_repetition

SENTENCE = "The target X-ray shows a shape that is roughly a square with a triangle folded over."


class RepetitionTests(unittest.TestCase):
    def test_five_allowed_six_stops(self):
        self.assertIsNone(detect_repetition((SENTENCE + "\n") * 5))
        self.assertEqual(detect_repetition((SENTENCE + "\n") * 6)["occurrences_at_detection"], 6)

    def test_inline_sentences_and_truncated_response(self):
        self.assertIsNotNone(detect_repetition((SENTENCE + " ") * 6 + "The targ"))

    def test_numbering_markdown_case_and_spacing(self):
        text = "\n".join(f"{i}. **{SENTENCE.upper() if i % 2 else SENTENCE.replace(' ', '  ')}**" for i in range(1, 7))
        self.assertIsNotNone(detect_repetition(text))

    def test_nonconsecutive_repetition(self):
        text = "\n".join(SENTENCE + f"\nDistinct intermediate observation number {i}." for i in range(6))
        self.assertIsNotNone(detect_repetition(text))

    def test_short_labels_coordinates_and_distinct_prose(self):
        self.assertIsNone(detect_repetition('Layer\n[0.5, 0.25]\n' * 20))
        text = "\n".join(f"Fold number {i} has a distinct offset and moves a different layer." for i in range(20))
        self.assertIsNone(detect_repetition(text))

    def test_thinking_tags(self):
        self.assertIsNotNone(detect_repetition('<think>\n' + ('* ' + SENTENCE + '\n') * 6 + '</think>'))


if __name__ == '__main__':
    unittest.main()
