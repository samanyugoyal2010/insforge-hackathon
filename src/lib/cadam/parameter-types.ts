/** Minimal parameter types for OpenSCAD preview sliders (from CADAM parseParameter). */

export type ParameterOption = {
  value: string | number | boolean;
  label?: string;
};

export type ParameterRange = {
  min?: number;
  max?: number;
  step?: number;
};

export type ParameterType =
  | "string"
  | "number"
  | "boolean"
  | "string[]"
  | "number[]"
  | "boolean[]";

export type CadOpenScadParameter = {
  description?: string;
  group: string;
  name: string;
  displayName: string;
  defaultValue: string | boolean | number | string[] | number[] | boolean[];
  range: ParameterRange;
  options: ParameterOption[];
  type: ParameterType;
  value: string | boolean | number | string[] | number[] | boolean[];
};
