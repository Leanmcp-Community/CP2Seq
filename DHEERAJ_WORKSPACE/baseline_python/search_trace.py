"""Bounded, optional search recording. No geometry validation is changed."""
import json

# Hard export safety caps. Increase deliberately here, not through the UI.
MAX_TRACE_STATES = 2_000
MAX_TRACE_EVENTS = 20_000
MAX_TRACE_BYTES = 16 * 1024 * 1024
TRACE_METADATA_RESERVE = 64 * 1024


def encoded_size(value):
    return len(json.dumps(value, allow_nan=False).encode("utf-8"))


class Trace:
    def __init__(self, problem, max_events):
        self.problem = problem
        self.max_events = min(max_events, MAX_TRACE_EVENTS)
        self.events = []
        self.nodes = []
        self.ids = {}
        self.retained = []  # Keep identities alive until recording ends.
        self.omitted = 0
        self.bytes_used = 0
        self.cap_reason = None

    def snapshot(self, state):
        return {"polygons": self.problem.polygons(state), "stack": list(state.stack)}

    def __call__(self, kind, node, details):
        if kind == "stop":
            self.events.append({"kind": kind, "node": self.ids.get(id(node)), **details})
            return
        if self.cap_reason is None and len(self.events) >= self.max_events:
            self.cap_reason = "event limit"
        if self.cap_reason is None and kind in ("root", "accepted") and len(self.nodes) >= MAX_TRACE_STATES:
            self.cap_reason = "state limit"
        if self.cap_reason:
            self.omitted += 1
            return
        node_id = self.ids.get(id(node)) if node is not None else None
        snapshot = None
        if kind in ("root", "accepted"):
            node_id = len(self.nodes)
            snapshot = self.snapshot(node.state) | {
                "parent": self.ids.get(id(node.parent)), "depth": node.depth,
                "action": node.action.as_dict() if node.action else None}
        event = {"kind": kind, "node": node_id, **details}
        additional = encoded_size(event) + (encoded_size(snapshot) if snapshot else 0) + 64
        if self.bytes_used + additional > MAX_TRACE_BYTES - TRACE_METADATA_RESERVE:
            self.cap_reason = "byte limit"
            self.omitted += 1
            return
        self.bytes_used += additional
        if snapshot is not None:
            self.ids[id(node)] = node_id
            self.retained.append(node)
            self.nodes.append(snapshot)
        self.events.append(event)

    def export(self, result):
        # The solution already lives in sequence.fold/result.json; don't duplicate
        # it into the trace. Compact serialization is part of the byte contract.
        data = {"version": 1, "algorithm": result.algorithm,
                "nodes": self.nodes, "events": self.events,
                "omitted_events": self.omitted, "event_limit": self.max_events,
                "cap_reason": self.cap_reason,
                "limits": {"states": MAX_TRACE_STATES, "events": MAX_TRACE_EVENTS,
                           "bytes": MAX_TRACE_BYTES}}
        if encoded_size(data) + 1 > MAX_TRACE_BYTES:
            raise ValueError("Trace exceeded its hard export byte limit")
        return data
