/**
 * Composites public/node0-logo.png onto a solid black square for app icons.
 * Run: npm run generate:app-icons (after changing the source logo).
 */
import sharp from "sharp";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const logoPath = join(root, "public/node0-logo.png");
const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };

/** Logo scale within the square (rest is black). ~0.88 keeps a thin safe margin. */
const LOGO_SCALE = 0.88;

async function writeIcon(size, outRelative) {
  const outPath = join(root, outRelative);
  const inset = Math.round(size * LOGO_SCALE);
  const resized = await sharp(logoPath)
    .ensureAlpha()
    .resize(inset, inset, { fit: "inside" })
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BLACK,
    },
  })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toFile(outPath);

  console.log("wrote", outPath);
}

await writeIcon(512, "src/app/icon.png");
await writeIcon(180, "src/app/apple-icon.png");
