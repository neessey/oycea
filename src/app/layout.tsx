import type { Metadata, Viewport } from "next";
import "./globals.css";
import CallProvider from "@/component/call/CallProvider";

// iOS n'affiche un écran de lancement que si son média correspond EXACTEMENT
// à l'iPhone (largeur, hauteur, densité, orientation) ET que l'image fait
// exactement la taille en pixels de l'écran. Une ligne par taille d'iPhone ;
// les images sont créées par `node scripts/generate-splash.mjs`.
const SPLASHES = [
  // iPhone SE (2e/3e gén.), 8, 7, 6s
  { w: 750, h: 1334, dw: 375, dh: 667, dpr: 2 },
  // iPhone 8 Plus, 7 Plus, 6s Plus
  { w: 1242, h: 2208, dw: 414, dh: 736, dpr: 3 },
  // iPhone X, XS, 11 Pro, 12 mini, 13 mini
  { w: 1125, h: 2436, dw: 375, dh: 812, dpr: 3 },
  // iPhone XR, 11
  { w: 828, h: 1792, dw: 414, dh: 896, dpr: 2 },
  // iPhone XS Max, 11 Pro Max
  { w: 1242, h: 2688, dw: 414, dh: 896, dpr: 3 },
  // iPhone 12, 12 Pro, 13, 13 Pro, 14
  { w: 1170, h: 2532, dw: 390, dh: 844, dpr: 3 },
  // iPhone 12 Pro Max, 13 Pro Max, 14 Plus
  { w: 1284, h: 2778, dw: 428, dh: 926, dpr: 3 },
  // iPhone 14 Pro, 15, 15 Pro, 16
  { w: 1179, h: 2556, dw: 393, dh: 852, dpr: 3 },
  // iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { w: 1290, h: 2796, dw: 430, dh: 932, dpr: 3 },
  // iPhone 16 Pro, 17, 17 Pro
  { w: 1206, h: 2622, dw: 402, dh: 874, dpr: 3 },
  // iPhone 16 Pro Max, 17 Pro Max
  { w: 1320, h: 2868, dw: 440, dh: 956, dpr: 3 },
  // iPhone Air
  { w: 1260, h: 2736, dw: 420, dh: 912, dpr: 3 },
];

export const metadata: Metadata = {
  title: "Oycea - Notre petit monde à deux",
  description:
    "Un espace privé pour jouer, regarder des films et se retrouver à distance.",
  applicationName: "Oycea",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Oycea",
    statusBarStyle: "default",
    startupImage: SPLASHES.map((s) => ({
      url: `/splash/oycea-${s.w}x${s.h}.png`,
      media: `(device-width: ${s.dw}px) and (device-height: ${s.dh}px) and (-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait)`,
    })),
  },
};

export const viewport: Viewport = {
  themeColor: "#9b777f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <CallProvider>{children}</CallProvider>
      </body>
    </html>
  );
}