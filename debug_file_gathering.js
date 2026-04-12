#!/usr/bin/env node
/**
 * Debug script to test our file gathering function
 */

const fs = require('fs').promises;
const path = require('path');

async function gatherArtifactsFromDirectory(outputDir) {
    const merged = {};
    const wantExt = new Set([
      ".svg",
      ".net",
      ".kicad_pcb",
      ".kicad_sch",
      ".sch",      // KiCad 5 schematic format
      ".kicad_pro",
    ]);

    const walk = async (absDir, relDir) => {
      let entries;
      try {
        entries = await fs.readdir(absDir, { withFileTypes: true });
      } catch (error) {
        console.log(`Failed to read directory ${absDir}: ${error.message}`);
        return;
      }

      console.log(`Scanning directory: ${absDir}`);
      console.log(`Found entries: ${entries.map(e => e.name)}`);

      for (const ent of entries) {
        const abs = path.join(absDir, ent.name);
        const rel = relDir ? `${relDir}/${ent.name}` : ent.name;

        if (ent.isDirectory()) {
          await walk(abs, rel);
          continue;
        }

        const ext = path.extname(ent.name).toLowerCase();
        const low = ent.name.toLowerCase();
        const take = wantExt.has(ext) || (ext === ".py" && low.includes("skidl"));

        console.log(`File: ${ent.name}, ext: ${ext}, take: ${take}`);

        if (!take) continue;

        try {
          const text = await fs.readFile(abs, "utf-8");
          merged[rel.split(path.sep).join("/")] = text;
          console.log(`✅ Added ${rel} (${text.length} chars)`);
        } catch (error) {
          console.log(`❌ Failed to read ${abs}: ${error.message}`);
        }
      }
    };

    await walk(outputDir, "");
    return merged;
}

async function main() {
    const testDir = "/var/folders/s_/flm07gc931x46b1p93lrlysm0000gn/T/circuitron-output/pcb-1775342610193";

    console.log(`🧪 Testing file gathering on: ${testDir}`);
    console.log(`Directory exists: ${await fs.access(testDir).then(() => true).catch(() => false)}`);

    try {
        const results = await gatherArtifactsFromDirectory(testDir);
        console.log(`\n📁 Gathered files: ${Object.keys(results)}`);
        console.log(`📊 Total files: ${Object.keys(results).length}`);

        for (const [filename, content] of Object.entries(results)) {
            console.log(`  - ${filename}: ${content.length} chars`);
        }
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
    }
}

main();