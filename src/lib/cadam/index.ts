export {
  extractOpenSCADCodeFromText,
  scoreOpenSCADCode,
} from "@/lib/cadam/extract-openscad";
export {
  formatCadGenerationContextBlock,
  cadIntentDescriptionFromArgs,
  pcbHintsFromToolArgs,
} from "@/lib/cadam/context";
export type { PcbOutlineHints } from "@/lib/cadam/context";
export {
  generateOpenscadFromContext,
  resolveCadOpenAiModel,
} from "@/lib/cadam/generate-openscad";
export type {
  GenerateOpenscadParams,
  GenerateOpenscadResult,
} from "@/lib/cadam/generate-openscad";
export { default as parseOpenScadParameters } from "@/lib/cadam/parse-parameters";
export type {
  CadOpenScadParameter,
  ParameterOption,
  ParameterRange,
  ParameterType,
} from "@/lib/cadam/parameter-types";
