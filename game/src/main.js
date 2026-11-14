// Élő festmény — Vihar a nagy Hortobágyon. Boot, the gallery and the way into the painting, the game loop.
import * as THREE from 'three';
import { applyPalette, setFactors, shared } from './paint.js';
import { makeSky } from './sky.js';
import { Post } from './post.js';
import { buildWorld, groundY, toBridge, BRIDGE_TOP, CEDAR_HILL, BRIDGES } from './world.js';
import { Cattle, Dog, Orbs, Riders, Standing } from './fauna.js';
import { Animals } from './animals.js';
import { Lights } from './lights.js';
import { AnimalDabs } from './animaldabs.js';
import { createBrushSheet } from './brush.js';
import { Minimap } from './minimap.js';
import { Highlights } from './highlights.js';
import { Board } from './board.js';
import { RoadGraph, lookAhead, pathLength } from './route.js';
import { Cart, ChaseCamera } from './cart.js';
import { Sound } from './audio.js';
import { TouchControls } from './touch.js';
import { BRIDGE } from './models.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;

// the canvas as the opening view sees it: its field of view, and where its horizon is
const CANVAS = { hfov: 66 * DEG, aspect: 3421 / 1741, horizonV: 0.3906 };
CANVAS.tanH = Math.tan(CANVAS.hfov / 2);
CANVAS.tanV = CANVAS.tanH / CANVAS.aspect;
CANVAS.pitch = Math.atan(-(1 - 2 * CANVAS.horizonV) * CANVAS.tanV);
const OPENING = new THREE.Vector3(0, 3.2, 0);   // the painter stood on a rise

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

class Game {
  constructor() {
    this.ready = false;
    this.autoplay = false;
    this.state = 'gallery';
    this.t = 0; this.time = 0;
    this.carried = 0; this.delivered = 0;
    this.sound = new Sound();
    this.input = { up: false, down: false, left: false, right: false, whip: false };
  }

  async init() {
    const canvas = $('gl');
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, Q.has('lowres') ? 1 : 1.5));
    r.autoClear = true;
    r.info.autoReset = false;

    const loader = new THREE.TextureLoader();
    const small = Q.has('small') || Math.min(screen.width, screen.height) < 700;
    const [palette, scan, sky] = await Promise.all([
      fetch('assets/palette.json').then((x) => x.json()),
      loader.loadAsync(small ? 'assets/painting-s.jpg' : 'assets/painting.jpg'),
      loader.loadAsync('assets/sky.jpg'),
    ]);
    setFactors(applyPalette(palette));
    shared.tBrush.value = createBrushSheet();
    this.shared = shared;   // (the showcase page reads the brush sheet and the lamps from here)
    scan.colorSpace = THREE.NoColorSpace;      // shown as it is, in display space
    scan.anisotropy = 4;
    sky.colorSpace = THREE.SRGBColorSpace;
    sky.anisotropy = 4;
    shared.tSky.value = sky;
    shared.uCanvas.value.set(CANVAS.tanH, CANVAS.tanV, Math.cos(CANVAS.pitch), Math.sin(CANVAS.pitch));
    shared.uCanvasAspect.value = CANVAS.aspect;

    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.25, 6000);
    this.camera.rotation.order = 'YXZ';
    this.sky = makeSky();
    scene.add(this.sky);
    this.world = buildWorld(scene);
    this.animals = await new Animals().load();
    this.cattle = new Cattle(scene, this.animals);
    // the horse herd (ménes) and the csikósok galloping round it
    this.herd = new Cattle(scene, this.animals, [{ x: -175, z: -300, r: 40, n: 10 }],
      { kind: 'horse', coats: ['bay', 'white', 'chestnut', 'black', 'golden', 'bay', 'white'], foreground: false, seed: 9 });
    this.riders = new Riders(scene, this.animals, { path: { cx: -175, cz: -290, rx: 115, rz: 70 } });
    // the pilgrims round the cedar's hill, at a walk (Zarándoklás a cédrusokhoz)
    this.pilgrims = new Riders(scene, this.animals, { path: { cx: 300, cz: -108, rx: 70, rz: 62 }, speed: 1.5, clip: 'Walk', timeScale: 0.95,
      coats: ['white', 'chestnut', 'golden', 'white', 'bay', 'black'], shirts: ['#9c3b2a', '#3e5aa0', '#d4a83a', '#2e6a4a', '#ece6da', '#7a3a6a'], gap: 6 });
    // and, behind the lonely cedar, riders galloping up and down (A magányos cédrus)
    this.cedarRiders = new Riders(scene, this.animals, { line: [[268, -132], [292, -146], [326, -140]], speed: 7, clip: 'Gallop', timeScale: 1.0, gap: 5, spread: 0.8,
      coats: ['bay', 'white', 'chestnut'], shirts: ['#b8452e', '#3e5aa0', '#d4a83a'] });
    // Hídon átvonuló társaság: a small company riding to and fro over the brook's stone bridge
    const T = this.world.tableau;
    this.company = new Riders(scene, this.animals, { line: T.lines.bridge, speed: 1.4, clip: 'Walk', timeScale: 0.85, gap: 4.5, spread: 0.4,
      coats: ['white', 'bay', 'golden'], shirts: ['#3e5aa0', '#9c3b2a', '#ece6da'], ladies: [0], hats: ['#d9c9a0', '#1d1a17', '#d8c79a'] });
    // Sétalovaglás a tengerparton: the riders along the lake's promenade
    this.shoreRide = new Riders(scene, this.animals, { line: T.lines.shore, speed: 1.6, clip: 'Walk', timeScale: 0.95, gap: 5.5, spread: 0.6,
      coats: ['white', 'black', 'bay', 'white', 'golden', 'chestnut', 'white'],
      shirts: ['#cfc4ad', '#2f4f8a', '#cfc4ad', '#8a7a60', '#cfc4ad', '#3a3a3a', '#d9cdb4'], ladies: [1, 4], hats: ['#d8c79a', '#e6dcc4', '#1d1a17'] });
    this.standing = new Standing(scene, this.animals, T.standing);
    this.lights = new Lights(scene, this.world.lamps);
    if (Q.get('dabs') !== '0') this.animalDabs = new AnimalDabs(scene, this.animals);
    this.orbs = new Orbs(scene, this.world);
    this.cart = new Cart(scene, this.world, this.animals, { x: 8, z: 10, yaw: -Math.PI / 2 });
    // the beasts are solid: the cart goes round the cattle, the horses, the standing animals, not through them
    // (each one two circles along its body)
    this.cart.obstacles = () => {
      const out = [], c = this.cart;
      const add = (x, z, yaw, s = 1) => {
        if ((x - c.x) ** 2 + (z - c.z) ** 2 > 400) return;
        const fx = -Math.sin(yaw) * 0.75 * s, fz = -Math.cos(yaw) * 0.75 * s;
        out.push({ x: x + fx, z: z + fz, r: 0.75 * s }, { x: x - fx, z: z - fz, r: 0.75 * s });
      };
      for (const herd of [this.cattle, this.herd]) for (const w of herd.cows) add(w.x, w.z, w.yaw, w.a.root.scale.x);
      for (const { a } of this.standing.list) add(a.root.position.x, a.root.position.z, a.root.rotation.y, a.root.scale.x);
      return out;
    };
    this.dog = new Dog(scene, this.animals);
    this.dog.place(10, 13, -Math.PI / 2);
    // the dog goes round the beasts too: the same ones as the cart, the riders, and the cart itself with its team
    this.dog.beasts = () => {
      const out = this.cart.obstacles(), c = this.cart, d = this.dog, f = c.forward;
      for (const grp of [this.pilgrims, this.cedarRiders, this.company, this.shoreRide]) for (const r of grp?.riders || []) {
        const p = r.h.root.position;
        if ((p.x - d.x) ** 2 + (p.z - d.z) ** 2 > 225) continue;
        const fx = -Math.sin(r.yaw || 0) * 0.75, fz = -Math.cos(r.yaw || 0) * 0.75;
        out.push({ x: p.x + fx, z: p.z + fz, r: 0.75 }, { x: p.x - fx, z: p.z - fz, r: 0.75 });
      }
      for (const a of [-1.0, 0.4, 1.8, 3.2, 4.4]) out.push({ x: c.x + f.x * a, z: c.z + f.z * a, r: 0.95 });   // (a: metres ahead of the cart's middle)
      return out;
    };
    this.chase = new ChaseCamera(this.camera, this.cart);
    this.cart.onWhip = () => this.sound.whip();
    this.cart.onStep = (g) => this.sound.hoof(g, this.onBridge());

    this.post = new Post(r, { quality: Q.get('q') || 'medium' });
    this.post.u.tScan.value = scan;
    this.post.u.uNear.value = this.camera.near;
    this.post.u.uFar.value = this.camera.far;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.rt.depthTexture = new THREE.DepthTexture(4, 4);

    // the sun's shadow: depth seen from the sun, over the ground round the camera
    const SM = Q.has('lowres') ? 1024 : 2048;
    this.shadowRT = new THREE.WebGLRenderTarget(SM, SM);
    this.shadowRT.depthTexture = new THREE.DepthTexture(SM, SM, THREE.UnsignedIntType);
    this.shadowCam = new THREE.OrthographicCamera(-95, 95, 95, -95, 1, 900);
    this.shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false });
    shared.tShadow.value = this.shadowRT.depthTexture;
    shared.uShadowTexel.value.set(1 / SM, 1 / SM);
    shared.uShadowOn.value = Q.has('noshadow') ? 0 : 1;
    // for comparison: ?hatch=0 leaves the hills smooth, ?matte=0 brings the varnished look back
    if (Q.get('hatch') === '0') shared.uHatch.value = 0;
    if (Q.get('cedarsky') === '0') this.cedarSky = false;
    // Mostar's sharp, coloured cast shadows (?townshadow=0: only the trace, as on the plain)
    shared.uTown.value.set(BRIDGES[1].x, BRIDGES[1].z, 120, Q.get('townshadow') === '0' ? 0 : 1);
    if (Q.get('matte') === '0') this.post.u.uMatte.value = 0;

    // the map, the places, the board
    this.minimap = new Minimap($('hud'), this.world.mapData);
    this.highlights = new Highlights($('hud'), this.world.landmarks, { selectedId: null });
    this.roads = new RoadGraph(this.world.roads, this.world.crossings);
    this.highlights.onSelect = (lm) => this.setTarget(lm);
    this.board = new Board(document.body, { onAgain: () => this.restart(), onClose: () => {} });
    this.playTime = 0; this.userTarget = null; this.finished = false;

    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.setOpeningCamera();
    this.nextBolt = 3;
    this.bolt = null;

    $('loading').hidden = true;
    if (Q.has('embed')) this.skipTo('show');
    else if (Q.has('play')) this.skipTo('play');
    else if (Q.has('view')) this.skipTo('view');
    else this.showGallery();
    this.clock = new THREE.Timer();
    r.setAnimationLoop((ts) => { this.clock.update(ts); if (!this.autoplay) this.frame(Math.min(this.clock.getDelta(), 0.05)); });
    this.ready = true;
  }

  // ------------------------------------------------------------------ the camera of the painting

  /** the camera that sees exactly what the canvas shows, and where the canvas then sits on screen (cover) */
  coverRect() {
    const As = this.w / this.h, Ap = CANVAS.aspect;
    if (As <= Ap) { const w = Ap / As; return { rect: [0.5 - w / 2, 0, 0.5 + w / 2, 1], vfov: 2 * Math.atan(CANVAS.tanV) }; }
    const h = As / Ap;
    return { rect: [0, 0.5 - h / 2, 1, 0.5 + h / 2], vfov: 2 * Math.atan(CANVAS.tanH / As) };
  }
  framedRect() {
    const As = this.w / this.h, Ap = CANVAS.aspect;
    // the label under the frame must fit too (a phone held sideways is short): the frame gives way to it
    const ph = $('plaque').offsetHeight || this.plaqueH || 170;
    this.plaqueH = ph;
    const below = (ph + this.plaqueGap() + 8) / this.h;
    let h = Math.min(0.58, 1 - 0.05 - below), w = (h * Ap) / As;
    if (w > 0.78) { w = 0.78; h = (w * As) / Ap; }
    const cy = Math.min(0.6, 1 - 0.05 - h / 2);
    return [0.5 - w / 2, cy - h / 2, 0.5 + w / 2, cy + h / 2];
  }
  plaqueGap() { return this.h < 560 ? 0.03 * this.h + 10 : 0.07 * this.h; }
  setOpeningCamera() {
    const c = this.coverRect();
    this.camera.fov = c.vfov / DEG;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(OPENING);
    this.camera.rotation.set(CANVAS.pitch, 0, 0, 'YXZ');
  }
  setRect(r) { this.post.u.uRect.value.set(r[0], r[1], r[2], r[3]); }

  showGallery() {
    this.state = 'gallery'; this.t = 0;
    this.touch?.release();
    this.setOpeningCamera();
    this.setRect(this.framedRect());
    const u = this.post.u;
    u.uScan.value = 1; u.uWall.value = 1;
    $('gallery').hidden = false; $('hud').hidden = true;
    this.placePlaque();
  }
  placePlaque() {
    const r = this.framedRect();
    const p = $('plaque');
    p.style.top = `${(1 - r[1]) * this.h + this.plaqueGap()}px`;
    if (this.state === 'gallery') this.setRect(r);
  }
  enter() {
    if (this.state !== 'gallery') return;
    this.sound.start();
    $('gallery').hidden = true;
    this.state = 'enter'; this.t = 0;
    this.rectFrom = this.framedRect();
  }
  skipTo(s) {
    $('gallery').hidden = true;
    const u = this.post.u;
    u.uWall.value = 0; u.uScan.value = 0;
    this.setRect(this.coverRect().rect);
    if (s === 'view') { this.state = 'view'; this.setOpeningCamera(); return; }
    if (s === 'show') {
      this.state = 'show'; this.setOpeningCamera(); $('hud').hidden = true;
      this.pose = { pos: this.camera.position.clone(), look: this.camera.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(50)), fov: this.camera.fov, sway: 0, t: 0, dur: 1 };
      this.poseFrom = null;
      return;
    }
    this.state = 'play'; this.camera.fov = 58; this.camera.updateProjectionMatrix();
    this.chase.snap(); $('hud').hidden = false;
  }

  // ------------------------------------------------------------------ the loop

  frame(dt) {
    this.time += dt; this.t += dt;
    if (Q.has('stats')) {
      const now = performance.now();
      if (this.lastNow) this.fps = (this.fps || 60) * 0.95 + (1000 / Math.max(1, now - this.lastNow)) * 0.05;
      this.lastNow = now;
      this.statT = (this.statT || 0) - dt;
      if (this.statT < 0) { this.statT = 0.5; $('stats').textContent = `${Math.round(this.fps)} fps · ${this.renderer.info.render.calls} rajzolás · ${(this.renderer.info.render.triangles / 1e6).toFixed(2)} M háromszög`; }
    }
    const u = this.post.u;
    shared.uTime.value = this.time;
    u.uTime.value = this.time;
    this.orbs.mat.uniforms.uTime.value = this.time;

    switch (this.state) {
      case 'gallery': break;
      case 'enter': {
        // the frame grows until the canvas fills the screen
        const k = ease(clamp01(this.t / 1.8));
        const to = this.coverRect().rect;
        this.setRect(this.rectFrom.map((v, i) => v + (to[i] - v) * k));
        u.uWall.value = 1;
        if (this.t >= 1.9) { this.state = 'dissolve'; this.t = 0; u.uWall.value = 0; }
        break;
      }
      case 'dissolve': {
        u.uScan.value = 1 - clamp01(this.t / 3.6);
        if (this.t >= 3.8) {
          this.state = 'fly'; this.t = 0; u.uScan.value = 0;
          this.flyFrom = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), fov: this.camera.fov };
          this.chase.snap();
        }
        break;
      }
      case 'fly': {
        const k = ease(clamp01(this.t / 3.4));
        this.chase.update(dt);
        const toPos = this.camera.position.clone(), toQuat = this.camera.quaternion.clone();
        this.camera.position.lerpVectors(this.flyFrom.pos, toPos, k);
        this.camera.quaternion.slerpQuaternions(this.flyFrom.quat, toQuat, k);
        this.camera.fov = this.flyFrom.fov + (58 - this.flyFrom.fov) * k;
        this.camera.updateProjectionMatrix();
        if (this.t > 1.2) $('hud').hidden = false;
        if (this.t >= 3.4) { this.state = 'play'; this.toast('Gyűjtsd össze a napfénycseppeket, és vidd őket a Kilenclyukú hídra: visszaszorítják a vihart!'); }
        break;
      }
      case 'play': this.play(dt); break;
      case 'view': break;
      case 'show': {
        // the eye flies to its pose, then drifts slowly round it, so the painting is seen to be alive
        const P = this.pose;
        P.t = (P.t ?? 0) + dt;
        const dur = P.dur > 0 ? P.dur : 1;
        const k = this.poseFrom ? ease(clamp01(P.t / dur)) : 1;
        const from = this.poseFrom || P;
        const sw = (P.sway || 0) * Math.min(1, P.t / dur);
        const off = new THREE.Vector3(Math.sin(this.time * 0.11) * sw, Math.sin(this.time * 0.07) * sw * 0.25, Math.cos(this.time * 0.09) * sw * 0.5);
        this.camera.position.lerpVectors(from.pos, P.pos, k).add(off);
        const look = from.look.clone().lerp(P.look, k);
        this.camera.fov = from.fov + (P.fov - from.fov) * k;
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(look);
        if (this.showClear !== undefined) shared.uClear.value += (this.showClear - shared.uClear.value) * Math.min(1, dt);
        break;
      }
    }
    if (this.state !== 'play') { this.cart.update(dt, {}); }
    this.cattle.update(dt, this.state === 'play' ? this.cart : null, this.camera);
    this.herd.update(dt, this.state === 'play' ? this.cart : null, this.camera);
    this.riders.update(dt);
    this.pilgrims.update(dt);
    this.cedarRiders.update(dt);
    this.company.update(dt);
    this.shoreRide.update(dt);
    this.standing.update(dt);
    this.lights.update(this.camera.position);
    this.animalDabs?.update(this.camera);
    // the dark foreground band of his canvas: in the living painting only, not over the scan itself
    const footT = this.state === 'play' || this.state === 'show' ? 1 - this.post.u.uScan.value : this.state === 'fly' ? clamp01(this.t / 3.4) : 0;
    this.post.u.uFoot.value += (footT - this.post.u.uFoot.value) * Math.min(1, dt * 3);
    // his colours, heightened ("élénk vörös, élénk kék, vadító sárga") — in the living painting, not over the scan
    this.post.tone.uniforms.uSat.value = 1.0 + 0.2 * this.post.u.uFoot.value;
    // by the lonely cedar the sky turns to that picture's own, gradually, as the cart climbs to it
    { const cd = Math.hypot(this.camera.position.x - CEDAR_HILL.x, this.camera.position.z - CEDAR_HILL.z);
      const want = this.cedarSky === false ? 0 : clamp01((230 - cd) / 150);
      shared.uCedar.value += (want * want * (3 - 2 * want) - shared.uCedar.value) * Math.min(1, dt * 1.5); }
    // napút: every drop brought to the bridge pushes the storm back
    const clear = this.orbs.total ? this.delivered / this.orbs.total : 0;
    if (this.state !== 'show' || this.showClear === undefined) shared.uClear.value += (clear - shared.uClear.value) * Math.min(1, dt * 0.4);
    this.dog.update(dt, this.cart);
    this.weather(dt);
    this.render();
  }

  play(dt) {
    const inp = { ...this.input, stickX: this.touch?.stickX ?? null, stickY: this.touch?.stickY ?? null };
    this.input.whip = false;
    this.cart.update(dt, inp);
    this.chase.update(dt);
    this.camera.fov += (58 + Math.max(0, this.cart.speed) * 0.7 - this.camera.fov) * Math.min(1, dt * 2);
    this.camera.updateProjectionMatrix();
    const c = this.cart;
    const got = this.orbs.collect({ x: c.x, y: c.y, z: c.z });
    if (got) { this.carried += got; for (let i = 0; i < got; i++) this.sound.chime(this.carried + i); }
    // delivering: on the bridge, near its crown
    const bl = toBridge(c.x, c.z);
    if (this.carried > 0 && Math.abs(bl.x) < 14 && Math.abs(bl.z) < BRIDGE.width / 2) {
      this.delivered += this.carried;
      this.toast(`${this.carried} fénycseppet hoztál a hídra. Összesen: ${this.delivered}`);
      this.carried = 0;
      this.sound.deliver();
      this.flash = 0.6;
      if (this.delivered >= this.orbs.total && !this.finished) {
        this.finished = true;
        this.toast('A vihar elvonult: megtaláltad a napútat!');
        setTimeout(() => this.board.show({ delivered: this.delivered, total: this.orbs.total, timeSec: this.playTime }), 3500);
      }
    }
    this.playTime += dt;
    this.sound.update(c.speed, this.onBridge(), 0.5);
    this.mooT = (this.mooT ?? 6) - dt;
    if (this.mooT < 0) {
      this.mooT = 7 + Math.random() * 12;
      const cow = this.cattle.cows[Math.floor(Math.random() * this.cattle.cows.length)];
      this.sound.moo(Math.hypot(cow.x - c.x, cow.z - c.z));
    }
    this.hud(dt);
  }

  onBridge() { const bl = toBridge(this.cart.x, this.cart.z); return Math.abs(bl.z) < BRIDGE.width / 2 && Math.abs(bl.x) < BRIDGE.half + 6; }

  // the storm: now and then a bolt in the west, the plain lit, thunder after it
  weather(dt) {
    this.nextBolt -= dt;
    if (this.nextBolt <= 0 && !this.bolt) {
      this.nextBolt = 6 + Math.random() * 10;
      this.bolt = { t: 0, az: -0.7 - Math.random() * 1.5, top: 0.16 + Math.random() * 0.1, seed: Math.random() * 100 };
      // how far: the azimuth's distance into the storm decides the delay
      const camAz = Math.atan2(-Math.sin(this.camera.rotation.y), -Math.cos(this.camera.rotation.y));
      void camAz;
      this.sound.thunder(1.2 + Math.random() * 2.5, 0.6 + Math.random() * 0.5);
    }
    let flash = (this.flash || 0);
    this.flash = Math.max(0, flash - dt * 2);
    if (this.bolt) {
      const b = this.bolt; b.t += dt;
      const f = Math.max(0, 1 - b.t / 0.12) + (b.t > 0.16 ? Math.max(0, 0.7 - (b.t - 0.16) / 0.2) : 0);
      flash = Math.max(flash, f);
      shared.uBolt.value.set(b.az, b.top, b.t < 0.38 ? 1 : 0, b.seed);
      if (b.t > 0.6) { this.bolt = null; shared.uBolt.value.z = 0; }
    }
    shared.uFlash.value = flash * 0.8;
    this.post.u.uFlash.value = flash * 0.5;
  }

  renderShadow() {
    this.renderer.info.reset();
    if (!shared.uShadowOn.value) return;
    const r = this.renderer, cam = this.shadowCam, sun = shared.uSunDir.value;
    // the square the shadow covers sits a little ahead of the camera, snapped to its texels so it does not crawl
    const f = this.camera.getWorldDirection(new THREE.Vector3());
    const texel = 190 / this.shadowRT.width;
    const cx = Math.round((this.camera.position.x + f.x * 55) / texel) * texel;
    const cz = Math.round((this.camera.position.z + f.z * 55) / texel) * texel;
    const cy = Math.round(groundY(cx, cz));
    cam.position.set(cx + sun.x * 400, cy + sun.y * 400, cz + sun.z * 400);
    cam.lookAt(cx, cy, cz);
    cam.updateMatrixWorld();
    shared.uShadowMat.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const hide = [this.sky, this.world.water, this.orbs.points];
    for (const o of hide) o.visible = false;
    this.scene.overrideMaterial = this.shadowMat;
    r.setRenderTarget(this.shadowRT);
    r.clear();
    r.render(this.scene, cam);
    this.scene.overrideMaterial = null;
    for (const o of hide) o.visible = true;
  }

  /** a chosen place: the guide and the map lead there by the roads until it is reached */
  setTarget(lm) {
    this.userTarget = lm || null;
    this.route = null; this.routeT = 0;
    if (lm) this.toast(`Úti cél: ${lm.name}`);
    this.hudT = 0;
  }

  /** showcase: fly the eye to a pose { pos:[x,y,z], look:[x,y,z], fov, sway (metres of slow drift) } */
  show(p) {
    if (this.state !== 'show') this.skipTo('show');
    const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const ok = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
    const here = ok(this.camera.position) ? this.camera.position.clone() : V(p.pos);
    this.poseFrom = { pos: here, look: ok(this.pose.look) ? this.pose.look.clone() : V(p.look), fov: Number.isFinite(this.camera.fov) ? this.camera.fov : (p.fov ?? 55) };
    this.pose = { pos: V(p.pos), look: V(p.look), fov: p.fov ?? 55, sway: p.sway ?? 1.2, t: 0, dur: p.dur ?? 2.6 };
    if (p.scan !== undefined) this.post.u.uScan.value = p.scan;
  }
  /** showcase: turn the painter's techniques on and off */
  setLook(o = {}) {
    if (o.oil !== undefined) this.post.setQuality(o.oil ? 'medium' : 'low');
    if (o.paint3 !== undefined) shared.uPaint3.value = o.paint3 ? 1 : 0;
    if (o.brush !== undefined) shared.uBrushOn.value = o.brush ? 1 : 0;
    if (o.dabs !== undefined && this.animalDabs) this.animalDabs.mesh.visible = !!o.dabs;
    if (o.lamps !== undefined) { this.lights.points.visible = !!o.lamps; shared.uLampCol.value.setScalar(0); if (o.lamps) shared.uLampCol.value.setRGB(1.6, 1.05, 0.5); }
    if (o.weave !== undefined) this.post.u.uWeave.value = o.weave ? 1 : 0;
    if (o.scan !== undefined) this.post.u.uScan.value = o.scan;
    if (o.clear !== undefined) this.showClear = o.clear;
    if (o.shadow !== undefined) shared.uShadowAmt.value = o.shadow;
    if (o.hatch !== undefined) shared.uHatch.value = o.hatch ? 1 : 0;
    if (o.cedarsky !== undefined) this.cedarSky = !!o.cedarsky;
    if (o.townshadow !== undefined) shared.uTown.value.w = o.townshadow ? 1 : 0;
    if (o.matte !== undefined) this.post.u.uMatte.value = o.matte ? 1 : 0;
  }

  restart() {
    this.carried = 0; this.delivered = 0; this.playTime = 0; this.finished = false; this.userTarget = null;
    const alive = this.orbs.geo.attributes.aAlive;
    this.orbs.list.forEach((o, i) => { o.alive = true; alive.setX(i, 1); });
    alive.needsUpdate = true;
    Object.assign(this.cart, { x: 8, z: 10, yaw: -Math.PI / 2, speed: 0 });
    this.chase.snap();
    if (this.state !== 'play') this.skipTo('play');
  }

  render() {
    const r = this.renderer;
    this.renderShadow();
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    this.post.render(this.rt);
  }

  resize() {
    const r = this.renderer;
    this.w = window.innerWidth; this.h = window.innerHeight;
    r.setSize(this.w, this.h, false);
    const pr = r.getPixelRatio();
    const W = Math.floor(this.w * pr), H = Math.floor(this.h * pr);
    this.rt.setSize(W, H);
    this.world.resize(Math.floor(W / 2), Math.floor(H / 2));
    this.post.setSize(W, H);
    shared.uResScale.value = H / 1080;
    this.orbs.mat.uniforms.uPx.value = 240 * (H / 1080);
    if (this.animalDabs) this.animalDabs.h = H;
    this.lights.setPx(0.5 * H / Math.tan((this.camera.fov * Math.PI) / 360));
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    if (this.state === 'gallery') { this.setOpeningCamera(); this.setRect(this.framedRect()); this.placePlaque(); }
    else if (this.state === 'view' || this.state === 'dissolve') { this.setOpeningCamera(); this.setRect(this.coverRect().rect); }
    else if (this.state === 'show') this.setRect(this.coverRect().rect);
  }

  // ------------------------------------------------------------------ input and HUD

  bindInput() {
    const set = (e, v) => {
      const k = e.code;
      if (k === 'KeyW' || k === 'ArrowUp') this.input.up = v;
      else if (k === 'KeyS' || k === 'ArrowDown') this.input.down = v;
      else if (k === 'KeyA' || k === 'ArrowLeft') this.input.left = v;
      else if (k === 'KeyD' || k === 'ArrowRight') this.input.right = v;
      else return false;
      return true;
    };
    window.addEventListener('keydown', (e) => {
      if (set(e, true)) { e.preventDefault(); return; }
      if (e.code === 'Space') { e.preventDefault(); if (this.state === 'play' && !e.repeat) this.input.whip = true; }
      if (e.code === 'Enter' && this.state === 'gallery') this.enter();
      if (e.code === 'KeyC') this.chase.far = !this.chase.far;
      if (e.code === 'KeyM') this.toggleSound();
      if (e.code === 'KeyK') this.toggleCamReturn();
      if (e.code === 'Escape' && this.state === 'play' && !this.board.isOpen) this.showGallery();
      if (e.code === 'Tab' && this.state === 'play') { e.preventDefault(); this.highlights.next(); }
      if (e.code === 'KeyL' && this.state === 'play') this.board.showOnly();
    });
    window.addEventListener('keyup', (e) => set(e, false));
    $('enter').addEventListener('click', () => this.enter());
    $('btn-sound').addEventListener('click', () => this.toggleSound());
    $('btn-cam').addEventListener('click', () => this.toggleCamReturn());
    try { if (localStorage.getItem('lp-cam-returns') === '0') this.toggleCamReturn(true); } catch {}
    $('btn-gallery').addEventListener('click', () => this.showGallery());
    $('btn-board').addEventListener('click', () => this.board.showOnly());
    const cv = $('gl');
    let last = null;
    // the wheel: nearer, farther (strongly: a notch is about a third)
    cv.addEventListener('wheel', (e) => {
      if (this.state !== 'play') return;
      e.preventDefault();
      const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      this.chase.wheel(Math.max(-300, Math.min(300, px)));
    }, { passive: false });
    // drag to look round; on a touch screen two fingers pinch nearer or farther
    const pts = new Map();
    let pinch = 0;
    cv.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      cv.setPointerCapture(e.pointerId);
      this.chase.dragging = true;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
      last = pts.size === 1 ? [e.clientX, e.clientY] : null;
    });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (this.state === 'play' && pinch) this.chase.wheel(Math.max(-300, Math.min(300, (pinch - d) * 2.5)));
        pinch = d;
        return;
      }
      if (!last) { last = [e.clientX, e.clientY]; return; }
      this.chase.orbit -= (e.clientX - last[0]) * (e.pointerType === 'touch' ? 0.009 : 0.006);
      this.chase.lift = Math.max(-2.5, Math.min(14, this.chase.lift + (e.clientY - last[1]) * 0.03));
      last = [e.clientX, e.clientY];
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      pinch = 0; last = null;
      if (!pts.size) this.chase.dragging = false;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    // the stick and the whip on a touch screen
    this.touch = new TouchControls($('hud'), { onWhip: () => { if (this.state === 'play') this.input.whip = true; } });
  }
  /** whether the camera drifts back behind the cart after one has looked round (remembered per browser) */
  toggleCamReturn(quiet = false) {
    const on = !this.chase.returns;
    this.chase.returns = on;
    const b = $('btn-cam');
    b.classList.toggle('off', !on);
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? 'A kamera visszaáll a szekér mögé (K)' : 'A kamera ott marad, ahová fordítottad (K)';
    try { localStorage.setItem('lp-cam-returns', on ? '1' : '0'); } catch {}
    if (!quiet) this.toast(on ? 'A kamera visszaáll a szekér mögé' : 'A kamera ott marad, ahová fordítottad');
  }

  toggleSound() { this.sound.setOn(!this.sound.on); $('btn-sound').classList.toggle('off', !this.sound.on); }

  toast(msg) {
    const el = $('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => el.classList.remove('show'), 3800);
  }

  hud(dt) {
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    $('drop-count').textContent = this.carried;
    $('bank-count').textContent = this.delivered;
    const c = this.cart;
    let target, label;
    if (this.userTarget && Math.hypot(this.userTarget.x - c.x, this.userTarget.z - c.z) < 25) {
      this.toast(`Megérkeztél: ${this.userTarget.name}`);
      this.userTarget = null; this.route = null; this.highlights.select(null);
    }
    if (this.userTarget) { target = this.userTarget; label = this.userTarget.name; }
    else if (this.carried > 0 || !this.orbs.remaining()) { target = BRIDGE_TOP; label = 'Kilenclyukú híd'; }
    else { target = this.orbs.nearest(c); label = 'Napfénycsepp'; }
    const p = { x: c.x, z: c.z, yaw: c.yaw };
    // the way there by the roads, re-planned now and then as the cart moves
    if (this.userTarget) {
      this.routeT = (this.routeT || 0) - 0.1;
      if (!this.route || this.routeT <= 0) { this.route = this.roads.route(c.x, c.z, target.x, target.z); this.routeT = 0.6; }
      else this.route[0] = { x: c.x, z: c.z };
    }
    this.minimap.setRoute(this.userTarget ? this.route : null);
    this.highlights.update(p);
    this.minimap.update(p, target, this.orbs.list.filter((o) => o.alive));
    if (!target) return;
    // the guide points along the way (to the next bend of the road), and tells how far it is by the road
    const aim = this.userTarget && this.route ? lookAhead(this.route, c.x, c.z) : target;
    const dx = aim.x - c.x, dz = aim.z - c.z;
    const dist = this.userTarget && this.route ? pathLength(this.route) : Math.hypot(target.x - c.x, target.z - c.z);
    // the arrow points relative to where the camera looks
    const camYaw = Math.atan2(-(this.chase.look.x - this.chase.pos.x), -(this.chase.look.z - this.chase.pos.z));
    const ang = Math.atan2(-dx, -dz) - camYaw;
    $('guide-arrow').style.transform = `rotate(${-ang}rad)`;
    $('guide-label').textContent = label;
    $('guide-dist').textContent = `${Math.round(dist)} m`;
    $('speed').textContent = c.gait < 0.1 ? 'áll' : c.gait < 1.5 ? 'lépés' : c.gait < 2.5 ? 'ügetés' : 'vágta';
  }
}

const game = new Game();
window.__game = game;
game.init().catch((e) => {
  console.error(e);
  $('loading').hidden = true;
  const f = $('fatal'); f.hidden = false; f.textContent = 'A festmény nem tölthető be: ' + (e.message || e);
});
