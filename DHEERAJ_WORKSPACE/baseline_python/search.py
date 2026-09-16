"""BFS and depth-limited graph DFS, with explicit resource-limit verdicts."""
from collections import deque
from dataclasses import dataclass, field
from time import monotonic


@dataclass
class Limits:
    max_depth: int = 24
    max_queries: int = 100000
    max_states: int = 50000
    seconds: float = 60.0

    def validate(self):
        from math import isfinite
        if self.max_depth < 0 or self.max_queries < 1 or self.max_states < 1:
            raise ValueError("Depth must be nonnegative; query/state limits must be positive")
        if not isfinite(self.seconds) or self.seconds <= 0:
            raise ValueError("Time limit must be positive and finite")


@dataclass
class Node:
    state: object
    parent: object = None
    action: object = None
    depth: int = 0


@dataclass
class Result:
    status: str
    algorithm: str
    queries: int = 0
    expanded: int = 0
    generated: int = 0
    visited: int = 1
    peak_frontier: int = 1
    max_depth_reached: int = 0
    elapsed_seconds: float = 0.0
    actions: list = field(default_factory=list)
    states: list = field(default_factory=list)
    replay_verified: bool = False

    def as_dict(self):
        return {k: v for k, v in vars(self).items() if k not in ("actions", "states")} | {
            "steps": len(self.actions) if self.status == "SOLVED" else None,
            "actions": [a.as_dict() for a in self.actions]}


def search(problem, algorithm="bfs", limits=None):
    """Only Problem's CP and target are visible; no reference trajectory.

    BFS is shortest in this unit-cost discrete graph, subject to numerical
    deduplication. DFS reopens a state reached at a shallower depth, so a deep
    first visit cannot incorrectly suppress a path within the depth limit.
    """
    if algorithm not in ("bfs", "dfs"):
        raise ValueError("algorithm must be bfs or dfs")
    limits = limits or Limits()
    limits.validate()
    started = monotonic()
    result = Result("EXHAUSTED_MODEL", algorithm)
    root = Node(problem.initial)
    best_depth = {problem.key(root.state): 0}
    depth_cut = False

    def finish(status, node=None):
        result.status = status
        result.visited = len(best_depth)
        result.elapsed_seconds = monotonic() - started
        if node is not None:
            while node is not None:
                result.states.append(node.state)
                if node.action is not None:
                    result.actions.append(node.action)
                node = node.parent
            result.states.reverse()
            result.actions.reverse()
            state = problem.initial
            for expected, action in zip(result.states[1:], result.actions):
                state = problem.apply(state, action)
                if state is None or problem.key(state) != problem.key(expected):
                    raise RuntimeError("Solution replay failed")
            if not problem.is_goal(state):
                raise RuntimeError("Replayed final state does not match target")
            result.replay_verified = True
        return result

    def child(node, action):
        result.queries += 1
        state = problem.apply(node.state, action)
        if state is None:
            return None
        result.generated += 1
        depth = node.depth + 1
        key = problem.key(state)
        if best_depth.get(key, float("inf")) <= depth:
            return None
        if key not in best_depth and len(best_depth) >= limits.max_states:
            raise MemoryError
        best_depth[key] = depth
        result.max_depth_reached = max(result.max_depth_reached, depth)
        return Node(state, node, action, depth)

    def budget():
        if monotonic()-started >= limits.seconds:
            return "TIME_LIMIT"
        if result.queries >= limits.max_queries:
            return "QUERY_LIMIT"
        return None

    if problem.is_goal(root.state):
        return finish("SOLVED", root)
    try:
        if algorithm == "bfs":
            queue = deque([root])
            while queue:
                node = queue.popleft()
                if node.depth >= limits.max_depth:
                    depth_cut = True
                    continue
                result.expanded += 1
                for action in problem.actions(node.state):
                    status = budget()
                    if status:
                        return finish(status)
                    nxt = child(node, action)
                    if nxt is None:
                        continue
                    if problem.is_goal(nxt.state):
                        return finish("SOLVED", nxt)
                    queue.append(nxt)
                    result.peak_frontier = max(result.peak_frontier, len(queue))
                if monotonic()-started >= limits.seconds:
                    return finish("TIME_LIMIT")
        else:
            # A stack of lazy child iterators implements actual depth-first
            # traversal without recursion limits or eagerly simulating siblings.
            stack = [(root, None)]
            while stack:
                node, iterator = stack[-1]
                if node.depth >= limits.max_depth:
                    depth_cut = True
                    stack.pop()
                    continue
                if iterator is None:
                    iterator = iter(problem.actions(node.state))
                    stack[-1] = (node, iterator)
                    result.expanded += 1
                status = budget()
                if status:
                    return finish(status)
                try:
                    action = next(iterator)
                except StopIteration:
                    stack.pop()
                    continue
                status = budget()
                if status:
                    return finish(status)
                nxt = child(node, action)
                if nxt is None:
                    continue
                if problem.is_goal(nxt.state):
                    return finish("SOLVED", nxt)
                stack.append((nxt, None))
                result.peak_frontier = max(result.peak_frontier, len(stack))
    except MemoryError:
        return finish("STATE_LIMIT")
    return finish("DEPTH_LIMIT" if depth_cut else "EXHAUSTED_MODEL")
