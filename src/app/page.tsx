
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Clapperboard,
  Gamepad2,
  LockKeyhole,
  MoonStar,
  Settings,
} from "lucide-react";

const activities = [
  {
    number: "01",
    title: "Game night",
    description: "Un petit jeu, une revanche, et encore une partie.",
    label: "Jouer ensemble",
    href: "/games",
    icon: Gamepad2,
    className: "game-card",
  },
  {
    number: "02",
    title: "Movie date",
    description: "Un film, des snacks et toi, même à distance.",
    label: "Aller au cinéma",
    href: "/cinema",
    icon: Clapperboard,
    className: "movie-card",
  },
  {
    number: "03",
    title: "Photobooth à deux",
    description:
      "Des poses complices, un compte à rebours et nos souvenirs en photos.",
    label: "Prendre des photos",
    href: "/photobooth",
    icon: Camera,
    className: "photobooth-card",
  },
];

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
  const supabase = createClient();
  let active = true;

  async function checkUser() {
    const { data } = await supabase.auth.getUser();

    if (!active) return;

    setEmail(data.user?.email ?? "");
    setCheckingAuth(false);
  }

  void checkUser();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!active) return;

    setEmail(session?.user?.email ?? "");
  });

  return () => {
    active = false;
    subscription.unsubscribe();
  };
}, []);
  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Erreur de déconnexion :", error.message);
      setLoggingOut(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[#9b777f]">
          Préparation de ton petit cocon...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden">
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Oycea, accueil">
          <span>
            oycea<span className="brand-dot">.</span>
          </span>
        </Link>

       
<div className="flex items-center gap-3">
  {email ? (
    <>
      <div className="private-label">
        <LockKeyhole size={13} />
        <span>{email}</span>
      </div>

      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        className="nav-link"
      >
        {loggingOut ? "Déconnexion..." : "Déconnexion"}
      </button>
    </>
  ) : (
    <>
      <Link href="/login" className="nav-link">
        Se connecter
      </Link>

      <Link href="/signup" className="primary-button">
        Créer un compte
        <ArrowRight size={17} />
      </Link>
    </>
  )}
</div>
      </header>

      <section id="home" className="hero-shell">
        <div className="hero-copy">
          <div className="eyebrow">
            <span>TON PETIT ENDROIT PRÉFÉRÉ</span>
          </div>

          <h1>
            La distance,
            <br />
            <span>un peu moins</span>
            <br />
            quand on est deux.
          </h1>

          <p className="hero-description">
            Un petit monde rien qu’à nous. Pour rire, jouer,
            regarder un film et se retrouver, même à des kilomètres.
          </p>

          <div className="hero-actions">
            <a className="primary-button" href="#activities">
              Organiser notre date
              <ArrowRight size={17} />
            </a>
          </div>
        </div>

        <div
          className="hero-art"
          aria-label="Illustration décorative de notre cocon"
        >
          <img src="/assets/hero.png" alt="" />
        </div>
      </section>

      <section id="activities" className="activities-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">ALORS, MON AMOUR…</span>
            <h2>
              On fait quoi ce soir ? <span>♡</span>
            </h2>
            <p>Choisis l’ambiance, je m’occupe du reste.</p>
          </div>
        </div>

        <div className="activity-grid">
          {activities.map((activity) => {
            const Icon = activity.icon;

            return (
              <article
                key={activity.number}
                className={`activity-card ${activity.className}`}
              >
                <div className="activity-topline">
                  <span className="activity-number">
                    {activity.number}
                  </span>

                  <span className="activity-icon">
                    <Icon size={22} />
                  </span>
                </div>

                <div className="activity-content">
                  <h3>{activity.title}</h3>
                  <p>{activity.description}</p>

                  <Link
                    className="activity-link"
                    href={activity.href}
                  >
                    {activity.label}
                    <ArrowRight size={16} />
                  </Link>
                </div>

                <div className="card-decoration" aria-hidden="true">
                  {activity.number === "01" ? (
                    <Gamepad2 size={92} />
                  ) : activity.number === "02" ? (
                    <MoonStar size={100} />
                  ) : (
                    <Camera size={100} />
                  )}
                </div>
              </article>
            );
          })}
        </div>

       
      </section>

      <footer className="site-footer">
        <Link href="/" className="footer-brand">
          oycea<span>.</span>
        </Link>

        <Link href="/settings" className="footer-private">
          <Settings size={12} />
          Paramètres
        </Link>
      </footer>
    </main>
  );
}
