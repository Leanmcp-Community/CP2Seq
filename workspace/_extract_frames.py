"""Split a corpus steps.fold into the faced CP (frame 0) and the target (last frame).

cp.fold has no faces_vertices and baseline_python/model.py requires a faced mesh, so the
crease pattern has to come from the multi-frame file instead.
"""
import json, sys

doc = json.load(open(sys.argv[1]))
frames = doc["file_frames"]
base = {k: v for k, v in doc.items() if k != "file_frames"}
drop = ("frame_parent", "frame_inherit", "frame_title")

cp = {**base, **frames[0], "frame_classes": ["creasePattern"]}
target = {**base, **frames[-1], "frame_classes": ["foldedForm"]}
for d in (cp, target):
    for k in drop:
        d.pop(k, None)
json.dump(cp, open(sys.argv[2], "w"))
json.dump(target, open(sys.argv[3], "w"))
