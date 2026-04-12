import { buildKicadStyleSchematicSvg } from "@/lib/pcbflow/kicad-style-schematic-svg";

/**
 * Graphical KiCad-style schematic preview from PCBFlow / tool args (not SPICE).
 */
export function buildLogicalSchematicSvgFromArgs(
  args: Record<string, unknown>,
  projectName: string,
): string {
  const components = Array.isArray(args.components) ? args.components : [];
  const nets = Array.isArray(args.nets) ? args.nets : [];
  return buildKicadStyleSchematicSvg(
    { components, nets },
    projectName,
    {
      footerNote:
        "PCBFlow: layout tab shows exported board SVG (Gerber-style). Open in KiCad for full symbols and DRC.",
    },
  );
}
