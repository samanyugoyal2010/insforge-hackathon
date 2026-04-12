/**
 * Parse top-of-file OpenSCAD parameters for UI sliders.
 * Derived from CADAM (GPL-3.0): supabase/functions/_shared/parseParameter.ts
 */

import type {
  CadOpenScadParameter,
  ParameterOption,
  ParameterRange,
  ParameterType,
} from "@/lib/cadam/parameter-types";

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function convertType(rawValue: string): {
  value: string | boolean | number | string[] | number[] | boolean[];
  type: ParameterType;
} {
  if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
    return { value: parseFloat(rawValue), type: "number" };
  }
  if (rawValue === "true" || rawValue === "false") {
    return { value: rawValue === "true", type: "boolean" };
  }
  if (/^".*"$/.test(rawValue)) {
    rawValue = rawValue.replace(/^"(.*)"$/, "$1");
    return { value: rawValue, type: "string" };
  }
  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    const arrayValue = rawValue
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim());

    if (
      arrayValue.length > 0 &&
      arrayValue.every((item) => /^\d+(\.\d+)?$/.test(item))
    ) {
      return {
        value: arrayValue.map((item) => parseFloat(item)),
        type: "number[]",
      };
    }
    if (
      arrayValue.length > 0 &&
      arrayValue.every((item) => /^".*"$/.test(item))
    ) {
      return {
        value: arrayValue.map((item) => item.slice(1, -1)),
        type: "string[]",
      };
    }
    if (
      arrayValue.length > 0 &&
      arrayValue.every((item) => item === "true" || item === "false")
    ) {
      return {
        value: arrayValue.map((item) => item === "true"),
        type: "boolean[]",
      };
    }
    throw new Error(
      `Invalid array value: ${rawValue}. Array elements must be all numbers, all booleans, or all quoted strings and not empty.`,
    );
  }
  throw new Error(`Invalid value: ${rawValue}`);
}

export default function parseParameters(script: string): CadOpenScadParameter[] {
  const moduleSplit = script.split(/^(module |function )/m);
  script = moduleSplit[0] ?? script;

  const parameters: Record<string, CadOpenScadParameter> = {};
  const parameterRegex =
    /^([a-z0-9A-Z_$]+)\s*=\s*([^;]+);\s*(\/\/[^\n]*)?/gm;
  const groupRegex = /^\/\*\s*\[([^\]]+)\]\s*\*\//gm;

  const groupSections: { id: string; group: string; code: string }[] = [
    { id: "", group: "", code: script },
  ];
  let tmpGroup: RegExpExecArray | null;

  while ((tmpGroup = groupRegex.exec(script)) !== null) {
    groupSections.push({
      id: tmpGroup[0],
      group: tmpGroup[1].trim(),
      code: "",
    });
  }

  groupSections.forEach((group, index) => {
    const nextGroup = groupSections[index + 1];
    const startIndex = script.indexOf(group.id);
    const endIndex = nextGroup ? script.indexOf(nextGroup.id) : script.length;
    group.code = script.substring(startIndex, endIndex);
  });

  if (groupSections.length > 1) {
    groupSections[0].code = script.substring(
      0,
      script.indexOf(groupSections[1].id),
    );
  }

  groupSections.forEach((groupSection) => {
    let match: RegExpExecArray | null;
    parameterRegex.lastIndex = 0;
    while ((match = parameterRegex.exec(groupSection.code)) !== null) {
      const name = match[1];
      const value = match[2];
      let typeAndValue:
        | { value: CadOpenScadParameter["value"]; type: ParameterType }
        | undefined;
      try {
        typeAndValue = convertType(value.trim());
      } catch {
        continue;
      }

      if (!typeAndValue) continue;

      let description: string | undefined;
      let options: ParameterOption[] = [];
      let range: ParameterRange = {};

      if (
        value !== "true" &&
        value !== "false" &&
        (value.match(/^[a-zA-Z_]/) || value.split("\n").length > 1)
      ) {
        continue;
      }

      if (match[3]) {
        const rawComment = match[3].replace(/^\/\/\s*/, "").trim();
        const cleaned = rawComment.replace(/^\[+|\]+$/g, "");

        if (!isNaN(Number(rawComment))) {
          if (typeAndValue.type === "string") {
            range = { max: parseFloat(cleaned) };
          } else {
            range = { step: parseFloat(cleaned) };
          }
        } else if (rawComment.startsWith("[") && cleaned.includes(",")) {
          options = cleaned
            .trim()
            .split(",")
            .map((option) => {
              const parts = option.trim().split(":");
              let optVal: ParameterOption["value"] = parts[0];
              const label: ParameterOption["label"] = parts[1];
              if (typeAndValue.type === "number") {
                optVal = parseFloat(String(optVal));
              }
              return { value: optVal, label };
            });
        } else if (cleaned.match(/([0-9]+:?)+/)) {
          const parts = cleaned.trim().split(":");
          const min = parts[0];
          const maxOrStep = parts[1];
          const max = parts[2];
          if (min && (maxOrStep || max)) {
            range = { min: parseFloat(min) };
          }
          if (max || maxOrStep || min) {
            range = {
              ...range,
              max: parseFloat(max || maxOrStep || min || "0"),
            };
          }
          if (max && maxOrStep) {
            range = { ...range, step: parseFloat(maxOrStep) };
          }
        }
      }

      let above = script.split(
        new RegExp(`^${escapeRegExp(match[0])}`, "gm"),
      )[0];
      if (above.endsWith("\n")) {
        above = above.slice(0, -1);
      }
      const splitted = above.split("\n").reverse();
      const lastLineBeforeDefinition = splitted[0];
      if (lastLineBeforeDefinition?.trim().startsWith("//")) {
        description = lastLineBeforeDefinition.replace(/^\/\/\/*\s*/, "");
        if (description.length === 0) {
          description = undefined;
        }
      }

      let displayName = name
        .replace(/_/g, " ")
        .split(" ")
        .map((word) => word[0]!.toUpperCase() + word.slice(1))
        .join(" ");
      if (name === "$fn") {
        displayName = "Resolution";
      }

      parameters[name] = {
        description,
        group: groupSection.group,
        name,
        displayName,
        defaultValue: typeAndValue.value,
        range,
        options,
        ...typeAndValue,
      };
    }
  });

  return Object.values(parameters);
}
