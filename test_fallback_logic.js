#!/usr/bin/env node
/**
 * Test our updated fallback directory logic
 */

const fs = require('fs').promises;
const path = require('path');
const { existsSync } = require('fs');

async function gatherArtifactsFromDirectory(outputDir) {
    const merged = {};
    const wantExt = new Set([".svg", ".net", ".kicad_pcb", ".kicad_sch", ".sch", ".kicad_pro"]);

    const walk = async (absDir, relDir) => {
        let entries;
        try {
            entries = await fs.readdir(absDir, { withFileTypes: true });
        } catch { return; }

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
            if (!take) continue;
            try {
                const text = await fs.readFile(abs, "utf-8");
                merged[rel.split(path.sep).join("/")] = text;
            } catch { /* unreadable */ }
        }
    };

    await walk(outputDir, "");
    return merged;
}

async function testFallbackLogic() {
    console.log('🧪 Testing updated fallback directory logic...');

    // Simulate what our subprocess does
    const finalOutputDir = "/some/nonexistent/primary/dir";
    let gathered = {};

    console.log(`📂 Primary directory: ${finalOutputDir}`);
    console.log(`📂 Primary directory exists: ${existsSync(finalOutputDir)}`);

    // Test fallback paths
    const fallbackPaths = [
        path.join(process.cwd(), 'circuitron_output'),
        path.join(process.cwd(), 'circuitron-integration', 'circuitron_output'),
        path.join(process.cwd(), 'circuitron-integration', 'circuitron-integration', 'circuitron_output')
    ];

    console.log('🔍 Checking fallback paths:');
    for (const fallbackPath of fallbackPaths) {
        const exists = existsSync(fallbackPath);
        console.log(`   ${fallbackPath} - exists: ${exists}`);

        if (exists) {
            console.log('📁 Scanning fallback directory...');
            const defaultGathered = await gatherArtifactsFromDirectory(fallbackPath);
            console.log(`   Found files: ${Object.keys(defaultGathered)}`);

            if (Object.keys(defaultGathered).length > 0) {
                gathered = defaultGathered;
                console.log(`✅ SUCCESS! Found files in: ${fallbackPath}`);
                break;
            }
        }
    }

    console.log(`\n📊 Final result: ${Object.keys(gathered).length} files found`);
    for (const [name, content] of Object.entries(gathered)) {
        console.log(`   - ${name}: ${content.length} chars`);
    }

    return Object.keys(gathered).length > 0;
}

testFallbackLogic();