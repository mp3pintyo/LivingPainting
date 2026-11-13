// The animals: rigged, animated models (Quaternius "Ultimate Animated Animals", CC0 — assets/models), re-coloured
// in the painting's own colours and painted with the same hand as the rest of the world. Each model's parts are
// merged into one skinned geometry with vertex colours (one draw per animal), then cloned per animal with its own
// skeleton and AnimationMixer. The models face +z; every rig here is turned to face -z like the rest of the world.
//
// Csontváry's horses are slender — small heads, long thin legs, one smooth tone each (Tengerparti sétalovaglás):
// the horse is drawn in a little narrower and taller than the model. His grey cattle carry long lyre horns: they
// are added on the head bone.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintMaterial } from './paint.js';
import * as MD from './models.js';

// coats: material name → colour (sRGB hex). Missing names keep a darkened version of the model's own.
const HORSE_COATS = {
  white: { Main: '#e9e4d8', Main_Light: '#f4f0e6', Main_Dark: '#d4cdbf', Hair: '#cfc6b4', Hooves: '#4a4038', Muzzle: '#7d7068', Eye_White: '#3a3530', Eye_Black: '#141210' },
  bay: { Main: '#7a3f22', Main_Light: '#8d4c2a', Main_Dark: '#5c2e18', Hair: '#1e1612', Hooves: '#2a221c', Muzzle: '#2a1c16', Eye_White: '#2a2420', Eye_Black: '#0e0c0a' },
  chestnut: { Main: '#a3592b', Main_Light: '#b46936', Main_Dark: '#874621', Hair: '#7a3c1c', Hooves: '#2a221c', Muzzle: '#3a2418', Eye_White: '#2a2420', Eye_Black: '#0e0c0a' },
  black: { Main: '#2a2622', Main_Light: '#38322c', Main_Dark: '#1e1b18', Hair: '#141210', Hooves: '#1a1714', Muzzle: '#141210', Eye_White: '#2a2420', Eye_Black: '#080706' },
  golden: { Main: '#c8963f', Main_Light: '#d8aa58', Main_Dark: '#a87a30', Hair: '#efe0b8', Hooves: '#3a3028', Muzzle: '#5a4434', Eye_White: '#2a2420', Eye_Black: '#0e0c0a' },
};
const COW_COATS = {
  grey: { Main: '#d9d4c8', Main_Light: '#ebe7dd', Hooves: '#2e2a26', Muzzle: '#3a3430', Eye_Black: '#121010', Eye_White: '#2a2622', Horns: '#e9e0cc' },
  greyDark: { Main: '#a9a49a', Main_Light: '#d2cdc2', Hooves: '#2e2a26', Muzzle: '#2e2a26', Eye_Black: '#121010', Eye_White: '#2a2622', Horns: '#e9e0cc' },
  cream: { Main: '#e6dccb', Main_Light: '#f2ece0', Hooves: '#2e2a26', Muzzle: '#4a3e36', Eye_Black: '#121010', Eye_White: '#2a2622', Horns: '#e9e0cc' },
};
const DOG_COATS = {
  white: { '*': '#ece6d6', Material: '#ece6d6' },
};

export const SCALES = {
  horse: new THREE.Vector3(0.36, 0.44, 0.43),   // slimmer and a touch taller than the model: his horses
  cow: new THREE.Vector3(0.3, 0.31, 0.3),
  dog: new THREE.Vector3(0.2, 0.2, 0.2),
};

const _c = new THREE.Color();

/** merge the model's skinned parts into one geometry, coloured per coat; returns { proto, clips, byCoat } */
function prepare(gltf, coats, opts = {}) {
  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  const base = meshes[0];
  const geoms = {};
  for (const [coat, map] of Object.entries(coats)) {
    const parts = meshes.map((m) => {
      const g = m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
      const name = m.material.name;
      if (map[name]) _c.set(map[name]);
      else if (map['*']) _c.set(map['*']);
      else _c.copy(m.material.color).multiplyScalar(0.8);
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g.index ? g : g;
    });
    const merged = mergeGeometries(parts, false);
    merged.computeBoundingSphere();
    merged.boundingSphere.radius *= 1.6;    // poses reach beyond the rest pose
    geoms[coat] = merged;
  }
  // the template: the armature with one skinned mesh
  for (const m of meshes.slice(1)) m.parent.remove(m);
  base.geometry = geoms[Object.keys(coats)[0]];
  const clips = {};
  for (const c of gltf.animations) clips[c.name] = c;
  return { proto: gltf.scene, clips, geoms, opts };
}

export class Animals {
  async load(base = 'assets/models/') {
    const loader = new GLTFLoader();
    const [horse, cow, dog] = await Promise.all(['Horse.gltf', 'Cow.gltf', 'Husky.gltf'].map((f) => loader.loadAsync(base + f)));
    this.kinds = {
      horse: prepare(horse, HORSE_COATS),
      cow: prepare(cow, COW_COATS),
      dog: prepare(dog, DOG_COATS),
    };
    this.mats = {
      horse: paintMaterial('beast', 0xffffff, { vertexColors: true, objScale: 0.42, stroke: 0.16 }),
      cow: paintMaterial('beast', 0xffffff, { vertexColors: true, objScale: 0.3, stroke: 0.16 }),
      dog: paintMaterial('beast', 0xffffff, { vertexColors: true, objScale: 0.2, stroke: 0.08 }),
    };
    this.hornGeo = makeLyreHorns();
    this.hornMat = paintMaterial('beast', 0xffffff, { vertexColors: true, objScale: 1, stroke: 0.08 });
    this.list = [];
    return this;
  }

  /**
   * a new animal: { root (face -z, feet on y=0), mixer, play(name, fade, timeScale), bone(name) }
   * kind: 'horse' | 'cow' | 'dog'; coat: a key of that kind's coats
   */
  make(kind, coat) {
    const K = this.kinds[kind];
    const rig = SkeletonUtils.clone(K.proto);
    let mesh = null;
    rig.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
    mesh.geometry = K.geoms[coat] || K.geoms[Object.keys(K.geoms)[0]];
    mesh.material = this.mats[kind];
    mesh.frustumCulled = true;
    rig.scale.copy(SCALES[kind]);
    rig.rotation.y = Math.PI;
    const root = new THREE.Group();
    root.add(rig);
    const mixer = new THREE.AnimationMixer(rig);
    const actions = {};
    for (const [name, clip] of Object.entries(K.clips)) actions[name] = mixer.clipAction(clip);
    const bones = {};
    rig.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    const a = {
      kind, root, rig, mesh, mixer, actions, bones, current: null,
      play(name, fade = 0.35, timeScale = 1) {
        const next = actions[name];
        if (!next) return;
        next.timeScale = timeScale;
        if (a.current === next) return;
        next.reset().setEffectiveWeight(1).play();
        if (a.current) a.current.crossFadeTo(next, fade, false);
        a.current = next;
      },
    };
    if (kind === 'cow') {
      // the long lyre horns of the Hungarian grey, on the head bone: set in the rest pose so that they stand up
      // from the top of the head whatever way the bone itself is turned
      rig.updateMatrixWorld(true);
      const head = bones.Head;
      const horns = new THREE.Mesh(this.hornGeo, this.hornMat);
      const at = rig.localToWorld(new THREE.Vector3(0, 4.3, 4.1));
      horns.position.copy(head.worldToLocal(at));
      const qb = head.getWorldQuaternion(new THREE.Quaternion()), qr = rig.getWorldQuaternion(new THREE.Quaternion());
      horns.quaternion.copy(qb.invert().multiply(qr));
      const sb = head.getWorldScale(new THREE.Vector3());
      horns.scale.set(1 / sb.x, 1 / sb.y, 1 / sb.z);
      head.add(horns);
    }
    // the clips do not all start at the same time: every animal keeps its own
    mixer.setTime(Math.random() * 3);
    this.list.push(a);
    return a;
  }
}

/** the horns of a Hungarian grey: out, up, then the tips turning out and back — a lyre (metres; +z forward) */
function makeLyreHorns() {
  const parts = [];
  for (const s of [1, -1]) {
    const pts = [[0.06 * s, 0.0, 0.0], [0.34 * s, 0.03, 0.02], [0.6 * s, 0.17, 0.0], [0.74 * s, 0.38, -0.08], [0.8 * s, 0.55, -0.2]];
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const seg = 16, radial = 6;
    const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
    const p = g.attributes.position, sp = curve.getSpacedPoints(seg), v = new THREE.Vector3();
    for (let i = 0; i <= seg; i++) {
      const r = 0.055 + (0.012 - 0.055) * (i / seg);
      for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; v.fromBufferAttribute(p, k).sub(sp[i]).multiplyScalar(r).add(sp[i]); p.setXYZ(k, v.x, v.y, v.z); }
    }
    g.computeVertexNormals();
    parts.push(MD.part(g, (c, x, y) => c.set(y > 0.55 ? '#2b2420' : '#ece3cf')));
  }
  return MD.merge(parts);
}
