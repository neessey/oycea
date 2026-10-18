
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Oycea - Notre petit monde à deux",
    short_name: "Oycea",
    description:
      "Un espace privé pour jouer, regarder des films et se retrouver à distance.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fff9f5",
    theme_color: "#fff9f5",
    icons: [
      {
        src: "/icons/oycea-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/oycea-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
