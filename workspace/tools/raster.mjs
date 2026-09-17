// Polygons in, PNG bytes out, with no dependencies.
//
// WHY THIS EXISTS. The loop's vision arm needs real pixels: the Messages API takes image blocks
// as PNG / JPEG / GIF / WebP, and SVG is not among them. Sending SVG SOURCE as text would not be
// a substitute -- the model would be reading markup, not looking at paper, and the "with vision"
// arm would silently be measuring something else. So the pictures have to be rasterised, and the
// usual way to rasterise is a dependency (headless browser, sharp, resvg, canvas).
//
// None is needed here. What the views draw is filled polygons with alpha, which is a scanline
// fill and an over-operator; and PNG's only hard part, DEFLATE, is in node's own zlib. Two
// hundred lines buys the vision channel without putting a native build step between a checkout
// and a run.
//
// ANTI-ALIASING BY SUPERSAMPLING. Folded paper is full of near-horizontal edges at 45 degrees and
// long thin slivers; aliased at 400px those break into staircases and a sliver can vanish between
// scanlines. Everything is drawn at SS times the requested size and box-filtered down. SS = 3 is
// nine samples per pixel, which is enough for edges this simple and costs nothing at these sizes.
import zlib from "zlib";

const SS = 3;

export class Canvas {
    constructor(w, h, bg = [255, 255, 255, 255]) {
        this.w = w; this.h = h;
        this.W = w * SS; this.H = h * SS;
        this.buf = Buffer.alloc(this.W * this.H * 4);
        for (let i = 0; i < this.W * this.H; i++) {
            this.buf[i * 4] = bg[0]; this.buf[i * 4 + 1] = bg[1];
            this.buf[i * 4 + 2] = bg[2]; this.buf[i * 4 + 3] = bg[3];
        }
    }

    // src OVER dst, straight (non-premultiplied) alpha, on an opaque canvas.
    #blend(x, y, [r, g, b, a]) {
        if (x < 0 || y < 0 || x >= this.W || y >= this.H || a <= 0) return;
        const i = (y * this.W + x) * 4, k = a / 255;
        this.buf[i]     = this.buf[i]     * (1 - k) + r * k;
        this.buf[i + 1] = this.buf[i + 1] * (1 - k) + g * k;
        this.buf[i + 2] = this.buf[i + 2] * (1 - k) + b * k;
        this.buf[i + 3] = 255;
    }

    /**
     * Scanline fill, sampling each row at its CENTRE.
     *
     * /!\ Sampling at y (the row's top edge) rather than y + 0.5 makes a vertex that lands
     * exactly on an integer row count twice, and the span between two such vertices inverts --
     * a wedge of paper comes out inside-out. Folded paper puts vertices on exact coordinates
     * constantly, so this is the normal case here, not an edge case.
     */
    fillPolygon(pts, rgba) {
        if (pts.length < 3) return;
        const P = pts.map(([x, y]) => [x * SS, y * SS]);
        let lo = Infinity, hi = -Infinity;
        for (const [, y] of P) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
        const y0 = Math.max(0, Math.floor(lo)), y1 = Math.min(this.H - 1, Math.ceil(hi));
        for (let y = y0; y <= y1; y++) {
            const cy = y + 0.5, xs = [];
            for (let i = 0; i < P.length; i++) {
                const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
                // A half-open test on the row span: each edge is counted at its lower end and
                // not its upper, so a shared vertex contributes exactly one crossing.
                if ((ay <= cy && by > cy) || (by <= cy && ay > cy))
                    xs.push(ax + (cy - ay) / (by - ay) * (bx - ax));
            }
            xs.sort((p, q) => p - q);
            for (let k = 0; k + 1 < xs.length; k += 2) {
                const s = Math.max(0, Math.ceil(xs[k] - 0.5));
                const e = Math.min(this.W - 1, Math.floor(xs[k + 1] - 0.5));
                for (let x = s; x <= e; x++) this.#blend(x, y, rgba);
            }
        }
    }

    // A line segment as a quad, so width is in the caller's units and joins are square. Good
    // enough for crease marks; this is a diagram renderer, not a vector engine.
    strokeSegment([ax, ay], [bx, by], rgba, width = 1) {
        const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
        if (L < 1e-9) return;
        const nx = -dy / L * width / 2, ny = dx / L * width / 2;
        this.fillPolygon([[ax + nx, ay + ny], [bx + nx, by + ny],
                          [bx - nx, by - ny], [ax - nx, ay - ny]], rgba);
    }

    // Dashes are how a valley fold is told from a mountain fold in every origami diagram, so a
    // renderer for this subject needs them; a legend mapping colour alone would not survive
    // being looked at in greyscale.
    strokeDashed(A, B, rgba, width, dash, gap) {
        const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
        if (L < 1e-9) return;
        const ux = dx / L, uy = dy / L;
        for (let t = 0; t < L; t += dash + gap) {
            const e = Math.min(L, t + dash);
            this.strokeSegment([A[0] + ux * t, A[1] + uy * t], [A[0] + ux * e, A[1] + uy * e], rgba, width);
        }
    }

    // Box-filter the supersampled buffer down to the requested size.
    #downsample() {
        const out = Buffer.alloc(this.w * this.h * 4);
        const n = SS * SS;
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
            let r = 0, g = 0, b = 0;
            for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
                const k = ((y * SS + j) * this.W + (x * SS + i)) * 4;
                r += this.buf[k]; g += this.buf[k + 1]; b += this.buf[k + 2];
            }
            const o = (y * this.w + x) * 4;
            out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
        }
        return out;
    }

    toPNG() { return encodePNG(this.#downsample(), this.w, this.h); }
    toDataURL() { return `data:image/png;base64,${this.toPNG().toString("base64")}`; }
    toBase64() { return this.toPNG().toString("base64"); }
}

/* ---------- PNG container ------------------------------------------------------------------ */
const CRC = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();
const crc32 = (b) => {
    let c = -1;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
};
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}
export function encodePNG(rgba, w, h) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;      // bit depth
    ihdr[9] = 6;      // colour type: RGBA
    // Every row is prefixed with filter byte 0 (None). Real encoders pick a filter per row to
    // improve compression; these images are flat colour and it would buy little.
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (w * 4 + 1)] = 0;
        rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

/* ---------- mapping paper coordinates onto the canvas --------------------------------------- */
// One transform for every view, so a model comparing two pictures is comparing the same frame.
// Paper y grows upward and image y grows downward, so the flip happens here, once.
export function fitter(pts, w, h, pad = 0.08) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const p of pts) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); }
    // /!\ Scale against EACH axis and take the tighter of the two, rather than fitting the larger
    // span into the smaller side. The old form was fine for a square view and wrong for the
    // exploded stack, which is tall and narrow: it scaled by the height into the width and drew
    // everything in a thin column with most of the image empty.
    const sx = (c - a) || 1, sy = (d - b) || 1;
    const S = Math.min(w / (sx * (1 + 2 * pad)), h / (sy * (1 + 2 * pad)));
    const ox = (a + c) / 2, oy = (b + d) / 2;
    return (p) => [w / 2 + (p[0] - ox) * S, h / 2 - (p[1] - oy) * S];
}
