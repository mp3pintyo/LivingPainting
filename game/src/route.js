// The way there by the roads: a graph of the road network (every road's bends are nodes; ends that meet, or come
// within a few metres of each other, are one node; the bridges are the edges that cross the water), and the
// shortest way through it from the cart to a chosen place (Dijkstra — the graph has a few dozen nodes).
const JOIN = 8;   // road ends closer than this are the same crossroads

export class RoadGraph {
  /** roads: [[[x, z], …], …]; crossings: [[{x,z}, {x,z}], …] (the bridges' two ends) */
  constructor(roads, crossings = []) {
    this.nodes = [];       // {x, z}
    this.adj = [];         // [[to, len], …]
    this.segs = [];        // [a, b] node indices of every road segment
    const node = (x, z) => {
      for (let i = 0; i < this.nodes.length; i++) if (Math.hypot(this.nodes[i].x - x, this.nodes[i].z - z) < JOIN) return i;
      this.nodes.push({ x, z }); this.adj.push([]);
      return this.nodes.length - 1;
    };
    const edge = (a, b) => {
      if (a === b) return;
      const len = Math.hypot(this.nodes[a].x - this.nodes[b].x, this.nodes[a].z - this.nodes[b].z);
      this.adj[a].push([b, len]); this.adj[b].push([a, len]);
      this.segs.push([a, b]);
    };
    for (const r of roads) {
      let prev = node(r[0][0], r[0][1]);
      for (let i = 1; i < r.length; i++) { const n = node(r[i][0], r[i][1]); edge(prev, n); prev = n; }
    }
    for (const [p, q] of crossings) edge(node(p.x, p.z), node(q.x, q.z));
  }

  /** the nearest point on any road: { seg, t, x, z, d } */
  nearest(x, z) {
    let best = null;
    for (const [a, b] of this.segs) {
      const A = this.nodes[a], B = this.nodes[b];
      const dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - A.x) * dx + (z - A.z) * dz) / L2));
      const px = A.x + dx * t, pz = A.z + dz * t, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { a, b, t, x: px, z: pz, d };
    }
    return best;
  }

  /** the way from (fx, fz) to (tx, tz): a polyline [{x, z}, …] from the cart, along the roads, to the place */
  route(fx, fz, tx, tz) {
    const s = this.nearest(fx, fz), e = this.nearest(tx, tz);
    if (!s || !e) return [{ x: fx, z: fz }, { x: tx, z: tz }];
    // the same stretch of road: no need to go round by a crossroads
    if ((s.a === e.a && s.b === e.b) || (s.a === e.b && s.b === e.a)) return [{ x: fx, z: fz }, { x: s.x, z: s.z }, { x: e.x, z: e.z }, { x: tx, z: tz }];
    const n = this.nodes.length, S = n, E = n + 1;
    const dist = new Float64Array(n + 2).fill(Infinity), prev = new Int32Array(n + 2).fill(-1), done = new Uint8Array(n + 2);
    const len = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
    const pt = (i) => (i === S ? s : i === E ? e : this.nodes[i]);
    // the start and end points sit on a segment: they reach that segment's two ends
    const extra = (i) => {
      const out = i === S ? [[s.a, len(s, this.nodes[s.a])], [s.b, len(s, this.nodes[s.b])]] : i < n ? this.adj[i].slice() : [];
      if (i === e.a) out.push([E, len(e, this.nodes[e.a])]);
      if (i === e.b) out.push([E, len(e, this.nodes[e.b])]);
      return out;
    };
    dist[S] = 0;
    for (;;) {
      let u = -1, du = Infinity;
      for (let i = 0; i < n + 2; i++) if (!done[i] && dist[i] < du) { du = dist[i]; u = i; }
      if (u < 0 || u === E) break;
      done[u] = 1;
      for (const [v, w] of extra(u)) if (du + w < dist[v]) { dist[v] = du + w; prev[v] = u; }
    }
    if (!isFinite(dist[E])) return [{ x: fx, z: fz }, { x: tx, z: tz }];
    const path = [];
    for (let i = E; i >= 0; i = prev[i]) { const p = pt(i); path.push({ x: p.x, z: p.z }); if (i === S) break; }
    path.reverse();
    path.unshift({ x: fx, z: fz });
    path.push({ x: tx, z: tz });
    return path;
  }
}

/** a polyline's length */
export function pathLength(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); return L; }

/** the first point of the way that is at least `ahead` metres from (x, z) along it — where to point the guide */
export function lookAhead(p, x, z, ahead = 18) {
  for (let i = 1; i < p.length; i++) if (Math.hypot(p[i].x - x, p[i].z - z) > ahead) return p[i];
  return p[p.length - 1];
}
