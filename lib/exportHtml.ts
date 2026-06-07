import type { RoomLayout } from "./insforge";

// The standalone viewer's module script. It reads window.__ROOM__ (injected
// above it) and renders the walkable 3D room. Kept free of backticks and ${}
// so it can be embedded inside a template literal safely.
const VIEWER_SCRIPT = `
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const ROOM = window.__ROOM__ || { layout: null, photos: [] };
const layout = ROOM.layout;
const photoUrls = ROOM.photos || [];

const mount = document.getElementById("app");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlay-text");

function safeColor(hex, fallback) {
  try {
    if (hex && /^#?[0-9a-f]{6}$/i.test(String(hex).replace("#", "")))
      return new THREE.Color(String(hex).charAt(0) === "#" ? hex : "#" + hex);
  } catch (e) {}
  return new THREE.Color(fallback);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
mount.appendChild(renderer.domElement);

const hasLayout = !!(layout && layout.dimensions);
const SCALE = 2.0;
let W, D, H, EYE, SPEED, MARGIN, PANEL_W, wallCol, floorCol, ceilCol;

if (hasLayout) {
  const dim = layout.dimensions;
  W = clamp(dim.width || 6, 3, 14) * SCALE;
  D = clamp(dim.depth || 6, 3, 14) * SCALE;
  H = clamp(dim.height || 2.7, 2.3, 3.6) * SCALE;
  EYE = 1.55 * SCALE; SPEED = 3.4 * SCALE; MARGIN = 0.45 * SCALE; PANEL_W = 1.2 * SCALE;
  wallCol = safeColor(layout.wallColor, 0x1d1d28);
  floorCol = safeColor(layout.floorColor, 0x16161d);
  ceilCol = safeColor(layout.ceilingColor, 0x0e0e14);
} else {
  const n = Math.max(photoUrls.length, 1);
  const perWall = Math.ceil(n / 4);
  const SIZE = Math.max(18, (perWall + 1) * 4.5);
  W = SIZE; D = SIZE; H = 7; EYE = 2.4; SPEED = 9; MARGIN = 1.2; PANEL_W = 3.0;
  wallCol = new THREE.Color(0x1d1d28); floorCol = new THREE.Color(0x16161d); ceilCol = new THREE.Color(0x0e0e14);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);
scene.fog = new THREE.Fog(0x0a0a0f, Math.max(W, D), Math.max(W, D) * 3.5);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, EYE, Math.min(D / 2 - MARGIN, 4));

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 0.6));
for (let gx = -1; gx <= 1; gx++) {
  for (let gz = -1; gz <= 1; gz++) {
    const p = new THREE.PointLight(0xfff4e6, 0.45, Math.max(W, D), 2);
    p.position.set((gx * W) / 3, H - 0.4, (gz * D) / 3);
    scene.add(p);
  }
}

const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: floorCol, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: ceilCol }));
ceil.rotation.x = Math.PI / 2; ceil.position.y = H; scene.add(ceil);

const wallMat = new THREE.MeshStandardMaterial({ color: wallCol, roughness: 1, side: THREE.FrontSide });
function mkWall(w, px, pz, rotY) {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat);
  wall.position.set(px, H / 2, pz); wall.rotation.y = rotY; scene.add(wall);
}
mkWall(W, 0, -D / 2, 0); mkWall(W, 0, D / 2, Math.PI);
mkWall(D, -W / 2, 0, Math.PI / 2); mkWall(D, W / 2, 0, -Math.PI / 2);

if (hasLayout && Array.isArray(layout.objects)) {
  for (const o of layout.objects) {
    const sz = o.size || [1, 1, 1];
    const pos = o.position || [0, 0, 0];
    const w = Math.max(0.05, Math.abs(sz[0] || 0.5)) * SCALE;
    const h = Math.max(0.02, Math.abs(sz[1] || 0.5)) * SCALE;
    const d = Math.max(0.05, Math.abs(sz[2] || 0.5)) * SCALE;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: safeColor(o.color, 0x6b7280), roughness: 0.85 }));
    mesh.position.set(
      clamp((pos[0] || 0) * SCALE, -W / 2 + w / 2, W / 2 - w / 2),
      Math.max(h / 2, (pos[1] || 0) * SCALE),
      clamp((pos[2] || 0) * SCALE, -D / 2 + d / 2, D / 2 - d / 2)
    );
    mesh.rotation.y = o.rotationY || 0;
    scene.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
    mesh.add(edges);
  }
}

const walls = [
  { px: 0, pz: -D / 2 + 0.06, rotY: 0, len: W },
  { px: 0, pz: D / 2 - 0.06, rotY: Math.PI, len: W },
  { px: -W / 2 + 0.06, pz: 0, rotY: Math.PI / 2, len: D },
  { px: W / 2 - 0.06, pz: 0, rotY: -Math.PI / 2, len: D }
];
const buckets = [[], [], [], []];
photoUrls.forEach(function (_, i) { buckets[i % 4].push(i); });

const loader = new THREE.TextureLoader();
const frameMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.6 });

buckets.forEach(function (indices, wIdx) {
  const wall = walls[wIdx];
  const m = indices.length;
  indices.forEach(function (photoIndex, j) {
    const t = (j + 1) / (m + 1);
    const along = -wall.len / 2 + t * wall.len;
    const group = new THREE.Group();
    if (wIdx < 2) group.position.set(along, EYE, wall.pz);
    else group.position.set(wall.px, EYE, along);
    group.rotation.y = wall.rotY;
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W + 0.2, PANEL_W + 0.2), frameMat);
    frame.position.z = 0.01; group.add(frame);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_W), new THREE.MeshBasicMaterial({ color: 0x222230 }));
    plane.position.z = 0.02; group.add(plane); scene.add(group);
    loader.load(photoUrls[photoIndex], function (tex) {
      tex.colorSpace = THREE.SRGBColorSpace;
      const img = tex.image;
      const aspect = (img.width / img.height) || 1;
      let pw = PANEL_W, ph = PANEL_W;
      if (aspect >= 1) ph = PANEL_W / aspect; else pw = PANEL_W * aspect;
      plane.geometry.dispose(); plane.geometry = new THREE.PlaneGeometry(pw, ph);
      plane.material.map = tex; plane.material.color.set(0xffffff); plane.material.needsUpdate = true;
      frame.geometry.dispose(); frame.geometry = new THREE.PlaneGeometry(pw + 0.2, ph + 0.2);
    });
  });
});

const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.object);
controls.addEventListener("lock", function () { overlay.style.display = "none"; });
controls.addEventListener("unlock", function () { overlay.style.display = "flex"; });
overlay.addEventListener("click", function () { controls.lock(); });

const keys = {};
document.addEventListener("keydown", function (e) { keys[e.code] = true; });
document.addEventListener("keyup", function (e) { keys[e.code] = false; });

const timer = new THREE.Timer();
function animate() {
  requestAnimationFrame(animate);
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  if (controls.isLocked) {
    const v = SPEED * dt;
    if (keys["KeyW"] || keys["ArrowUp"]) controls.moveForward(v);
    if (keys["KeyS"] || keys["ArrowDown"]) controls.moveForward(-v);
    if (keys["KeyD"] || keys["ArrowRight"]) controls.moveRight(v);
    if (keys["KeyA"] || keys["ArrowLeft"]) controls.moveRight(-v);
    camera.position.y = EYE;
    camera.position.x = clamp(camera.position.x, -W / 2 + MARGIN, W / 2 - MARGIN);
    camera.position.z = clamp(camera.position.z, -D / 2 + MARGIN, D / 2 - MARGIN);
  }
  renderer.render(scene, camera);
}
animate();
overlayText.textContent = hasLayout ? "Click to walk through the room" : "Click to enter the gallery";

window.addEventListener("resize", function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
`;

export function buildStandaloneHtml(args: {
  title: string;
  layout: RoomLayout | null;
  photoDataUrls: string[];
}): string {
  const payload = JSON.stringify({
    title: args.title,
    layout: args.layout,
    photos: args.photoDataUrls,
  });
  const safeTitle = (args.title || "3D Room").replace(/[<&]/g, "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeTitle} — 3D Model</title>
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.184.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.184.0/examples/jsm/"
  }
}
</script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; overflow: hidden; background: #0a0a0f; }
  #app { position: fixed; inset: 0; }
  #overlay {
    position: fixed; inset: 0; z-index: 10;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
    color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    cursor: pointer; text-align: center;
  }
  #overlay .card {
    border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.04);
    padding: 24px 32px; border-radius: 16px;
  }
  #overlay-text { font-size: 18px; font-weight: 500; }
  #overlay .hint { margin-top: 8px; font-size: 13px; color: rgba(255,255,255,0.5); }
  kbd { background: rgba(255,255,255,0.1); border-radius: 4px; padding: 1px 6px; }
  #title-tag {
    position: fixed; top: 14px; left: 14px; z-index: 11;
    color: rgba(255,255,255,0.8); font-family: -apple-system, sans-serif; font-size: 13px;
    background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1);
    padding: 6px 12px; border-radius: 8px; backdrop-filter: blur(4px);
  }
</style>
</head>
<body>
<div id="app"></div>
<div id="title-tag">${safeTitle}</div>
<div id="overlay">
  <div class="card">
    <div id="overlay-text">Click to enter</div>
    <div class="hint">Move with <kbd>W A S D</kbd> · Look with the mouse · <kbd>Esc</kbd> to release</div>
  </div>
</div>
<script>window.__ROOM__ = ${payload};</script>
<script type="module">${VIEWER_SCRIPT}</script>
</body>
</html>`;
}

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Fetch all photos as data URLs, build the standalone HTML, and trigger a
// browser download. Returns the file size in bytes.
export async function downloadRoomHtml(opts: {
  filename: string;
  title: string;
  layout: RoomLayout | null;
  photoUrls: string[];
}): Promise<number> {
  const dataUrls = (await Promise.all(opts.photoUrls.map(urlToDataUrl))).filter(
    (u): u is string => Boolean(u)
  );

  const html = buildStandaloneHtml({
    title: opts.title,
    layout: opts.layout,
    photoDataUrls: dataUrls,
  });

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return blob.size;
}
