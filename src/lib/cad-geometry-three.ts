import * as THREE from "three";
import { toCreasedNormals } from "three-stdlib";
import type { CadFeature } from "@/lib/cad-document";

const MM = 0.001;
const eps = 0.00001;

/** 2D rounded rectangle profile (drei-style), then extruded along Z. */
function createRoundedRectShape(width: number, height: number, radius0: number) {
  const shape = new THREE.Shape();
  const radius = Math.max(radius0 - eps, eps);
  shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true);
  shape.absarc(eps, height - radius * 2, eps, Math.PI, Math.PI / 2, true);
  shape.absarc(width - radius * 2, height - radius * 2, eps, Math.PI / 2, 0, true);
  shape.absarc(width - radius * 2, eps, eps, 0, -Math.PI / 2, true);
  return shape;
}

function createRoundedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius0: number,
  smoothness = 4,
): THREE.BufferGeometry {
  const r = Math.min(
    radius0,
    width / 2 - eps,
    height / 2 - eps,
    depth / 2 - eps,
  );
  const shape = createRoundedRectShape(width, height, r);
  /** Keep extrusion depth positive; tiny values collapse CSG to paper-thin shells. */
  const extrudeDepth = Math.max(depth - r * 2, eps * 8);
  const params = {
    depth: extrudeDepth,
    bevelEnabled: true,
    bevelSegments: 8,
    steps: 1,
    bevelSize: r - eps,
    bevelThickness: r,
    curveSegments: smoothness,
  };
  const geom = new THREE.ExtrudeGeometry(shape, params);
  geom.center();
  toCreasedNormals(geom, 0.4);
  return geom;
}

/**
 * BufferGeometry for one feature, centered at origin (mm → m). Apply world
 * transform on the Brush / mesh, not on the geometry.
 */
export function featureToBufferGeometry(f: CadFeature): THREE.BufferGeometry {
  switch (f.shape) {
    case "box": {
      const sx = (f.sizeMm?.x ?? 10) * MM;
      const sy = (f.sizeMm?.y ?? 10) * MM;
      const sz = (f.sizeMm?.z ?? 10) * MM;
      return new THREE.BoxGeometry(sx, sy, sz);
    }
    case "roundedBox": {
      const sx = (f.sizeMm?.x ?? 10) * MM;
      const sy = (f.sizeMm?.y ?? 10) * MM;
      const sz = (f.sizeMm?.z ?? 10) * MM;
      const r = (f.cornerRadiusMm ?? 1) * MM;
      return createRoundedBoxGeometry(sx, sy, sz, r, 4);
    }
    case "cylinder": {
      const r = (f.radiusMm ?? 5) * MM;
      const h = (f.heightMm ?? f.sizeMm?.y ?? 10) * MM;
      return new THREE.CylinderGeometry(r, r, h, 32);
    }
    case "sphere": {
      const r = (f.radiusMm ?? 5) * MM;
      return new THREE.SphereGeometry(r, 28, 28);
    }
    default: {
      return new THREE.BoxGeometry(MM, MM, MM);
    }
  }
}
