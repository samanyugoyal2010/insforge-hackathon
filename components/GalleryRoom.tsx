"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import type { RoomLayout } from "@/lib/insforge";

type Props = { photoUrls: string[]; layout?: RoomLayout | null };

function safeColor(hex: string | undefined, fallback: number): THREE.Color {
  try {
    if (hex && /^#?[0-9a-f]{6}$/i.test(hex.replace("#", "")))
      return new THREE.Color(hex.startsWith("#") ? hex : `#${hex}`);
  } catch {
    /* ignore */
  }
  return new THREE.Color(fallback);
}

export default function GalleryRoom({ photoUrls, layout }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const lockApi = useRef<{ lock: () => void } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    // ── Renderer ───────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // ── Room parameters (AI layout vs. fallback gallery) ───────
    const hasLayout = !!layout?.dimensions;
    const SCALE = 2.0; // meters → world units
    let W: number, D: number, H: number;
    let EYE: number, SPEED: number, MARGIN: number, PANEL_W: number;
    let wallCol: THREE.Color, floorCol: THREE.Color, ceilCol: THREE.Color;

    if (hasLayout) {
      const dim = layout!.dimensions;
      W = THREE.MathUtils.clamp(dim.width || 6, 3, 14) * SCALE;
      D = THREE.MathUtils.clamp(dim.depth || 6, 3, 14) * SCALE;
      H = THREE.MathUtils.clamp(dim.height || 2.7, 2.3, 3.6) * SCALE;
      EYE = 1.55 * SCALE;
      SPEED = 3.4 * SCALE;
      MARGIN = 0.45 * SCALE;
      PANEL_W = 1.2 * SCALE;
      wallCol = safeColor(layout!.wallColor, 0x1d1d28);
      floorCol = safeColor(layout!.floorColor, 0x16161d);
      ceilCol = safeColor(layout!.ceilingColor, 0x0e0e14);
    } else {
      const n = Math.max(photoUrls.length, 1);
      const perWall = Math.ceil(n / 4);
      const SIZE = Math.max(18, (perWall + 1) * 4.5);
      W = SIZE;
      D = SIZE;
      H = 7;
      EYE = 2.4;
      SPEED = 9;
      MARGIN = 1.2;
      PANEL_W = 3.0;
      wallCol = new THREE.Color(0x1d1d28);
      floorCol = new THREE.Color(0x16161d);
      ceilCol = new THREE.Color(0x0e0e14);
    }

    // ── Scene & camera ─────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    scene.fog = new THREE.Fog(0x0a0a0f, Math.max(W, D), Math.max(W, D) * 3.5);

    const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 500);
    camera.position.set(0, EYE, Math.min(D / 2 - MARGIN, 4));

    // ── Lights ─────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 0.6));
    for (let gx = -1; gx <= 1; gx++) {
      for (let gz = -1; gz <= 1; gz++) {
        const p = new THREE.PointLight(0xfff4e6, 0.45, Math.max(W, D), 2);
        p.position.set((gx * W) / 3, H - 0.4, (gz * D) / 3);
        scene.add(p);
      }
    }

    // ── Room shell ─────────────────────────────────────────────
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ color: floorCol, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ color: ceilCol })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = H;
    scene.add(ceil);

    const wallMat = new THREE.MeshStandardMaterial({
      color: wallCol,
      roughness: 1,
      side: THREE.FrontSide,
    });
    const mkWall = (w: number, px: number, pz: number, rotY: number) => {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat);
      wall.position.set(px, H / 2, pz);
      wall.rotation.y = rotY;
      scene.add(wall);
    };
    mkWall(W, 0, -D / 2, 0);
    mkWall(W, 0, D / 2, Math.PI);
    mkWall(D, -W / 2, 0, Math.PI / 2);
    mkWall(D, W / 2, 0, -Math.PI / 2);

    // ── AI-inferred furniture ──────────────────────────────────
    if (hasLayout && Array.isArray(layout!.objects)) {
      for (const o of layout!.objects) {
        const sz = o.size || [1, 1, 1];
        const pos = o.position || [0, 0, 0];
        const w = Math.max(0.05, Math.abs(sz[0] || 0.5)) * SCALE;
        const h = Math.max(0.02, Math.abs(sz[1] || 0.5)) * SCALE;
        const d = Math.max(0.05, Math.abs(sz[2] || 0.5)) * SCALE;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshStandardMaterial({
            color: safeColor(o.color, 0x6b7280),
            roughness: 0.85,
          })
        );
        mesh.position.set(
          THREE.MathUtils.clamp((pos[0] || 0) * SCALE, -W / 2 + w / 2, W / 2 - w / 2),
          Math.max(h / 2, (pos[1] || 0) * SCALE),
          THREE.MathUtils.clamp((pos[2] || 0) * SCALE, -D / 2 + d / 2, D / 2 - d / 2)
        );
        mesh.rotation.y = o.rotationY || 0;
        scene.add(mesh);

        // soft edge outline so boxes read as objects
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry),
          new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })
        );
        mesh.add(edges);
      }
    }

    // ── Photos hung around the four walls ──────────────────────
    const walls = [
      { px: 0, pz: -D / 2 + 0.06, rotY: 0, len: W },
      { px: 0, pz: D / 2 - 0.06, rotY: Math.PI, len: W },
      { px: -W / 2 + 0.06, pz: 0, rotY: Math.PI / 2, len: D },
      { px: W / 2 - 0.06, pz: 0, rotY: -Math.PI / 2, len: D },
    ];
    const buckets: number[][] = [[], [], [], []];
    photoUrls.forEach((_, i) => buckets[i % 4].push(i));

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    let loadedCount = 0;
    const total = photoUrls.length;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.6 });

    buckets.forEach((indices, wIdx) => {
      const wall = walls[wIdx];
      const m = indices.length;
      indices.forEach((photoIndex, j) => {
        const t = (j + 1) / (m + 1);
        const along = -wall.len / 2 + t * wall.len;
        const group = new THREE.Group();
        if (wIdx < 2) group.position.set(along, EYE, wall.pz);
        else group.position.set(wall.px, EYE, along);
        group.rotation.y = wall.rotY;

        const frame = new THREE.Mesh(
          new THREE.PlaneGeometry(PANEL_W + 0.2, PANEL_W + 0.2),
          frameMat
        );
        frame.position.z = 0.01;
        group.add(frame);

        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(PANEL_W, PANEL_W),
          new THREE.MeshBasicMaterial({ color: 0x222230 })
        );
        plane.position.z = 0.02;
        group.add(plane);
        scene.add(group);

        loader.load(
          photoUrls[photoIndex],
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            const img = tex.image as { width: number; height: number };
            const aspect = img.width / img.height || 1;
            let pw = PANEL_W;
            let ph = PANEL_W;
            if (aspect >= 1) ph = PANEL_W / aspect;
            else pw = PANEL_W * aspect;
            plane.geometry.dispose();
            plane.geometry = new THREE.PlaneGeometry(pw, ph);
            const pm = plane.material as THREE.MeshBasicMaterial;
            pm.map = tex;
            pm.color.set(0xffffff);
            pm.needsUpdate = true;
            frame.geometry.dispose();
            frame.geometry = new THREE.PlaneGeometry(pw + 0.2, ph + 0.2);
            loadedCount++;
            if (loadedCount >= total) setReady(true);
          },
          undefined,
          () => {
            loadedCount++;
            if (loadedCount >= total) setReady(true);
          }
        );
      });
    });
    if (total === 0) setReady(true);

    // ── Pointer-lock controls + WASD movement ──────────────────
    const controls = new PointerLockControls(camera, renderer.domElement);
    scene.add(controls.object);
    lockApi.current = { lock: () => controls.lock() };
    controls.addEventListener("lock", () => setLocked(true));
    controls.addEventListener("unlock", () => setLocked(false));

    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => (keys[e.code] = true);
    const onKeyUp = (e: KeyboardEvent) => (keys[e.code] = false);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    const timer = new THREE.Timer();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      timer.update();
      const dt = Math.min(timer.getDelta(), 0.05);
      if (controls.isLocked) {
        const v = SPEED * dt;
        if (keys["KeyW"] || keys["ArrowUp"]) controls.moveForward(v);
        if (keys["KeyS"] || keys["ArrowDown"]) controls.moveForward(-v);
        if (keys["KeyD"] || keys["ArrowRight"]) controls.moveRight(v);
        if (keys["KeyA"] || keys["ArrowLeft"]) controls.moveRight(-v);
        camera.position.y = EYE;
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, -W / 2 + MARGIN, W / 2 - MARGIN);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, -D / 2 + MARGIN, D / 2 - MARGIN);
      }
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
          else mat.dispose();
        }
      });
      if (renderer.domElement.parentNode === mount)
        mount.removeChild(renderer.domElement);
    };
  }, [photoUrls, layout]);

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="h-full w-full" />
      {!locked && (
        <button
          onClick={() => lockApi.current?.lock()}
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-sm transition-opacity"
        >
          <div className="rounded-2xl border border-white/15 bg-white/[0.04] px-8 py-6 text-center">
            <p className="text-lg font-medium">
              {ready
                ? layout
                  ? "Click to walk through your reconstructed room"
                  : "Click to enter the gallery"
                : "Loading photos…"}
            </p>
            <p className="mt-2 text-sm text-white/50">
              Move with <kbd className="rounded bg-white/10 px-1.5">W A S D</kbd> ·
              Look with the mouse · <kbd className="rounded bg-white/10 px-1.5">Esc</kbd> to release
            </p>
          </div>
        </button>
      )}
    </div>
  );
}
