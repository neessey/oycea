
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
  },
};

export const viewport: Viewport = {
  themeColor: "#fff9f5",
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
