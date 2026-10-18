
import type { Metadata, Viewport } from "next";
import "./globals.css";
import CallProvider from "@/component/call/CallProvider";

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
  startupImage: [
    {
      url: "/splash/oycea-iphone.png",
      media:
        "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
    },
  ],
},

};

export const viewport: Viewport = {
  themeColor: "##9b777f",
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
