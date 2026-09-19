"""Detect repeated substantive prose in one completion, without provider imports."""
from collections import Counter
import re
import unicodedata

MAX_OCCURRENCES = 5


def normalize(text):
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"^\s*(?:(?:[-*•>]\s+|\d+[.)]\s+))+", "", text)
    text = re.sub(r"[`*_]", "", text)
    return re.sub(r"\s+", " ", text).strip().rstrip(".!? ").casefold()


def detect_repetition(text, max_occurrences=MAX_OCCURRENCES):
    """Stop at six occurrences, consecutive or not, without double counting.

    Require >=6 words and >=32 characters to avoid short labels, JSON punctuation
    and repeated coordinate values. Exact after normalization, not semantic
    similarity. The caller must retain the full raw output.
    """
    if max_occurrences < 1:
        raise ValueError("max_occurrences must be positive")
    text = re.sub(r"<\|[^>]+\|>|</?think>", "\n", text)
    units = {"line": text.splitlines(),
             "sentence": re.split(r"[.!?](?:\s+|$)|\n+", text)}
    for kind, pieces in units.items():
        counts = Counter()
        for piece in pieces:
            normalized = normalize(piece)
            if len(normalized) < 32 or len(re.findall(r"\b\w+\b", normalized)) < 6:
                continue
            counts[normalized] += 1
            if counts[normalized] > max_occurrences:
                return {"unit": kind, "text": normalized, "occurrences_at_detection": counts[normalized],
                        "max_allowed": max_occurrences, "scope": "single_model_response"}
    return None
