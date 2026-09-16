"""Build the Pureland Layer Scope viewer, in both forms.

  python3 DHEERAJ_WORKSPACE/pureland/build.py
  python3 DHEERAJ_WORKSPACE/pureland/build.py --serve        # then open localhost

Emits two files from one template:

  viewer.html        for the Claude artifact. Body content only -- the platform wraps it in
                     <!doctype html><head>...</head><body> and injects a small reset, so the
                     file must NOT carry its own skeleton.
  dist/index.html    standalone, for localhost / file:// / any static host. Same page plus the
                     skeleton and the equivalent reset, so it renders identically on its own.

Both embed all 27 sequences inline (~183 KB of JSON), so neither needs a data fetch. The only
network dependency is three.js from cdnjs.
"""
import json, os, sys, glob, subprocess, http.server, socketserver, functools

HERE = os.path.dirname(os.path.abspath(__file__))
VIZ = os.path.join(HERE, "..", "data", "pureland", "viz")
DIST = os.path.join(HERE, "dist")

# ---- 1. pack the per-sequence payloads into one compact blob -------------------------------
def pack():
    out = {}
    for f in sorted(glob.glob(os.path.join(VIZ, "*.json"))):
        d = json.load(open(f))
        out[d["sequence"]] = [{
            "n":  s["step"],
            "Vf": [[round(c, 4) for c in v] for v in s["Vf"]],
            "F":  s["faces"],
            "d":  s["depth"],
            "V":  [[round(c, 4) for c in v] for v in s["V"]],
            "EV": s["EV"],
            "EA": "".join(a[0] for a in s["EA"]),
        } for s in d["steps"]]
    return out

if not os.path.isdir(VIZ):
    sys.exit(f"missing {VIZ} -- run: python3 {os.path.join(HERE, 'extract.py')}")

data = pack()
blob = json.dumps(data, separators=(",", ":"))
# a literal </script> inside the JSON would close the host element early
assert "</script" not in blob.lower()

tpl = open(os.path.join(HERE, "viewer.template.html")).read()
assert "__DATA__" in tpl, "template lost its data placeholder"
body = tpl.replace("__DATA__", blob)

# ---- 2. the artifact build: body only ------------------------------------------------------
art = os.path.join(HERE, "viewer.html")
open(art, "w").write(body)

# ---- 3. the standalone build: skeleton + the reset the artifact platform injects ------------
# Kept deliberately minimal and matched to that reset, so the two builds render the same page:
# safe-area padding on :root, zero body margin, responsive images, working [hidden].
SKELETON = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
  :root {
    color-scheme: light dark;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  body { margin: 0; }
  img { max-width: 100%; }
  [hidden] { display: none !important; }
</style>
__BODY__
</html>
"""
os.makedirs(DIST, exist_ok=True)
standalone = os.path.join(DIST, "index.html")
# plain replace, not %-formatting: the CSS above is full of literal % units
open(standalone, "w").write(SKELETON.replace("__BODY__", body))

kb = lambda p: os.path.getsize(p) / 1024
print(f"sequences {len(data)}  keyframes {sum(len(v) for v in data.values())}  payload {len(blob)/1024:.0f} KB")
print(f"  artifact build   {art}          {kb(art):.0f} KB")
print(f"  standalone build {standalone}   {kb(standalone):.0f} KB")

# ---- 4. optional: serve it ------------------------------------------------------------------
if "--serve" in sys.argv:
    want = None
    for a in sys.argv:
        if a.startswith("--port="):
            want = int(a.split("=", 1)[1])

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, fmt, *args):          # one line per request, not three
            sys.stdout.write(f"  {self.address_string()} {fmt % args}\n")
            sys.stdout.flush()

    Handler = functools.partial(Quiet, directory=DIST)
    socketserver.TCPServer.allow_reuse_address = True

    # Try the requested port, then a few alternates, then let the OS choose. A port being
    # taken by something unrelated should not stop the viewer from coming up.
    candidates = ([want] if want else []) + [8765, 8770, 8781, 8842, 9123, 0]
    httpd = None
    for p in candidates:
        try:
            httpd = socketserver.TCPServer(("127.0.0.1", p), Handler)
            break
        except OSError as e:
            print(f"  port {p or 'auto'} unavailable ({e.strerror}), trying next")
    if httpd is None:
        sys.exit("could not bind any port")

    port = httpd.server_address[1]
    print(f"\n  Pureland Layer Scope  ->  http://localhost:{port}/")
    print(f"  serving {DIST}   (ctrl-c to stop)\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
        httpd.server_close()
