/** Minimal CAD primitive models for Three.js preview (enhanced CAD viewport). */

export type Vec3 = { x: number; y: number; z: number };

export abstract class CadPrimitive {
  readonly position: Vec3;
  constructor(position: Vec3) {
    this.position = position;
  }
}

export class ParametricBox extends CadPrimitive {
  readonly length: number;
  readonly width: number;
  readonly height: number;

  constructor(
    position: Vec3,
    length: number,
    width: number,
    height: number,
  ) {
    super(position);
    this.length = length;
    this.width = width;
    this.height = height;
  }
}

export class LBracket extends CadPrimitive {
  readonly armLength: number;
  readonly armWidth: number;
  readonly thickness: number;
  readonly flangeHeight: number;
  readonly hasGusset: boolean;
  readonly gussetThickness: number;

  constructor(
    position: Vec3,
    opts: {
      armLength: number;
      armWidth: number;
      thickness: number;
      flangeHeight: number;
      hasGusset?: boolean;
      gussetThickness?: number;
    },
  ) {
    super(position);
    this.armLength = opts.armLength;
    this.armWidth = opts.armWidth;
    this.thickness = opts.thickness;
    this.flangeHeight = opts.flangeHeight;
    this.hasGusset = opts.hasGusset ?? false;
    this.gussetThickness = opts.gussetThickness ?? opts.thickness;
  }
}

export class Cylinder extends CadPrimitive {
  readonly radius: number;
  readonly height: number;

  constructor(position: Vec3, radius: number, height: number) {
    super(position);
    this.radius = radius;
    this.height = height;
  }
}
