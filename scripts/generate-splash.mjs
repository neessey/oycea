// À placer dans : scripts/generate-splash.mjs
// Installation : npm i -D sharp
//
// Usage :
//   node scripts/generate-splash.mjs <image> [couleur] [mode]
//
//   <image>   ton logo (PNG, idéalement carré) ou un visuel de splash complet
//   [couleur] fond, par défaut #fff9f5
//   [mode]    "logo"  (défaut) : logo centré sur fond uni, ~32 % de la largeur
//             "cover" : l'image remplit tout l'écran (rognée si besoin)
//
// Exemples :
//   node scripts/generate-splash.mjs public/icon-512.png "#fff9f5"
//   node scripts/generate-splash.mjs mon-splash.png "#fff9f5" cover

import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SOURCE = process.argv[2];
const BG = process.argv[3] || "#fff9f5";
const MODE = process.argv[4] || "logo";
const OUT = "public/splash";

if (!SOURCE) {
  console.error("Indique l'image source : node scripts/generate-splash.mjs public/icon-512.png");
  process.exit(1);
}

// Doit rester identique à la liste SPLASHES de app/layout.tsx
const SIZES = [
  [750, 1334],
  [1242, 2208],
  [1125, 2436],
  [828, 1792],
  [1242, 2688],
  [1170, 2532],
  [1284, 2778],
  [1179, 2556],
  [1290, 2796],
  [1206, 2622],
  [1320, 2868],
  [1260, 2736],
];

await mkdir(OUT, { recursive: true });

for (const [w, h] of SIZES) {
  const file = `${OUT}/oycea-${w}x${h}.png`;

  if (MODE === "cover") {
    await sharp(SOURCE)
      .resize(w, h, { fit: "cover", position: "centre" })
      .flatten({ background: BG })
      .png()
      .toFile(file);
  } else {
    const logoSize = Math.round(Math.min(w, h) * 0.32);
    const logo = await sharp(SOURCE)
      .resize(logoSize, logoSize, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    await sharp({
      create: { width: w, height: h, channels: 4, background: BG },
    })
      .composite([{ input: logo, gravity: "center" }])
      .flatten({ background: BG })
      .png()
      .toFile(file);
  }

  console.log("OK", file);
}