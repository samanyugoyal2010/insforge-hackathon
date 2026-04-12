import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Brush, Evaluator, ADDITION, SUBTRACTION } from "three-bvh-csg";
import type { CadDocument, CadFeature } from "@/lib/cad-document";
import { featureToBufferGeometry } from "@/lib/cad-geometry-three";

const MM = 0.001;
/** Slightly inflate subtract brushes so cuts are never coplanar with targets (BVH CSG fails on shared faces). */
const SUBTRACT_SCALE = 1.002;

const SURFACE_EPS_M = 8e-5;

function applyOpenFaceCut(
  base: Brush,
  face: "front" | "top",
  reveal: number,
  evaluator: Evaluator,
  mat: THREE.MeshStandardMaterial,
): Brush {
  base.updateMatrixWorld();
  const g = base.geometry;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  if (!bb) return base;
  const { min, max } = bb;
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  const cz = (min.z + max.z) / 2;
  const r = Math.min(0.92, Math.max(0.08, reveal));

  if (face === "front") {
    const depth = max.z - min.z;
    const dz = Math.max(depth * r, 1e-4);
    const sx = Math.max((max.x - min.x) * 1.45, 1e-4);
    const sy = Math.max((max.y - min.y) * 1.45, 1e-4);
    const cutGeom = new THREE.BoxGeometry(sx, sy, dz);
    const cut = new Brush(cutGeom, mat);
    cut.position.set(cx, cy, max.z - dz / 2 - SURFACE_EPS_M * 4);
    cut.updateMatrixWorld();
    return evaluator.evaluate(base, cut, SUBTRACTION);
  }

  const height = max.y - min.y;
  const dy = Math.max(height * r, 1e-4);
  const sx = Math.max((max.x - min.x) * 1.45, 1e-4);
  const sz = Math.max((max.z - min.z) * 1.45, 1e-4);
  const cutGeom = new THREE.BoxGeometry(sx, dy, sz);
  const cut = new Brush(cutGeom, mat);
  cut.position.set(cx, max.y - dy / 2 - SURFACE_EPS_M * 4, cz);
  cut.updateMatrixWorld();
  return evaluator.evaluate(base, cut, SUBTRACTION);
}

function geometryForFeature(
  f: CadFeature,
  useSimpleBoxes: boolean,
): THREE.BufferGeometry {
  const effective: CadFeature =
    useSimpleBoxes && f.shape === "roundedBox"
      ? { ...f, shape: "box" }
      : f;
  return featureToBufferGeometry(effective);
}

function prepareGeometry(
  raw: THREE.BufferGeometry,
  op: CadFeature["op"],
): THREE.BufferGeometry {
  const tol = 1e-5;
  const merged = mergeVertices(raw, tol);
  raw.dispose();
  merged.computeVertexNormals();
  if (op === "subtract") {
    merged.applyMatrix4(
      new THREE.Matrix4().makeScale(
        SUBTRACT_SCALE,
        SUBTRACT_SCALE,
        SUBTRACT_SCALE,
      ),
    );
  }
  return merged;
}

function evaluateChain(
  doc: CadDocument,
  useSimpleBoxes: boolean,
): THREE.BufferGeometry | null {
  if (!doc.features.length) return null;

  const evaluator = new Evaluator();
  // Runtime API (see three-bvh-csg Evaluator): CDT path is more robust on thin cuts.
  (evaluator as unknown as { useCDTClipping: boolean }).useCDTClipping = true;

  const mat = new THREE.MeshStandardMaterial();
  let base: Brush | null = null;

  for (const f of doc.features) {
    const raw = geometryForFeature(f, useSimpleBoxes);
    const geom = prepareGeometry(raw, f.op);
    if (!base && f.op === "subtract") {
      geom.dispose();
      continue;
    }
    const brush = new Brush(geom, mat);
    brush.position.set(
      f.positionMm.x * MM,
      f.positionMm.y * MM,
      f.positionMm.z * MM,
    );
    if (f.rotationDeg) {
      brush.rotation.set(
        THREE.MathUtils.degToRad(f.rotationDeg.x),
        THREE.MathUtils.degToRad(f.rotationDeg.y),
        THREE.MathUtils.degToRad(f.rotationDeg.z),
      );
    }
    brush.updateMatrixWorld();

    if (!base) {
      base = brush;
      continue;
    }

    const op = f.op === "subtract" ? SUBTRACTION : ADDITION;
    base = evaluator.evaluate(base, brush, op);
  }

  if (!base?.geometry) return null;

  const pos = base.geometry.attributes.position;
  if (!pos || pos.count < 9) {
    base.geometry.dispose();
    return null;
  }

  const pres = doc.presentation;
  try {
    if (pres?.openFace === "front") {
      base = applyOpenFaceCut(
        base,
        "front",
        pres.openFaceReveal ?? 0.52,
        evaluator,
        mat,
      );
    } else if (pres?.openFace === "top") {
      base = applyOpenFaceCut(
        base,
        "top",
        pres.openFaceReveal ?? 0.52,
        evaluator,
        mat,
      );
    }
  } catch {
    /* keep uncut solid */
  }

  return base.geometry.clone();
}

/**
 * Solid CSG for CAD features. Tries smooth meshes first; on failure uses boxes only
 * (rounded extrusions often break three-bvh-csg half-edge BVH).
 */
export function evaluateCadCsg(doc: CadDocument): THREE.BufferGeometry | null {
  try {
    const g = evaluateChain(doc, false);
    if (g?.attributes.position && g.attributes.position.count >= 9) return g;
    g?.dispose();
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[cad-csg] smooth CSG failed, retrying with boxes:", e);
    }
  }

  try {
    const g = evaluateChain(doc, true);
    if (g?.attributes.position && g.attributes.position.count >= 9) return g;
    g?.dispose();
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[cad-csg] box CSG failed:", e);
    }
  }

  return null;
}
