
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  ArrowRight,
  CalendarHeart,
  Check,
  Clapperboard,
  Clock3,
  Gamepad2,
  Heart,
  LockKeyhole,
  MessageCircleHeart,
  MoonStar,
  Music2,
  Sparkles,
  Stars,
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
];

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function checkUser() {
      const { data, error } = await supabase.auth.getUser();

      if (!active) return;

      if (error || !data.user) {
        router.replace("/login");
        return;
      }

      setEmail(data.user.email ?? "");
      setCheckingAuth(false);
    }

    void checkUser();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogout() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Erreur de déconnexion :", error.message);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  if (checkingAuth) {
    return (
      <main className="min-h-screen flex items-center justify-center">
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
          
          <span>oycea<span className="brand-dot">.</span></span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <a className="nav-link active" href="#home">Notre cocon</a>
          <a className="nav-link" href="#activities">Nos rendez-vous</a>
          <a className="nav-link" href="#little-things">Nos petits moments</a>
        </nav>

        <div className="flex items-center gap-3">
  <div className="private-label">
    <LockKeyhole size={13} />
    <span>{email}</span>
  </div>

  <button
    type="button"
    onClick={handleLogout}
    className="nav-link"
  >
    Déconnexion
  </button>
</div>
      </header>

      <section id="home" className="hero-shell">
        <div className="hero-copy">
          <div className="eyebrow">
            <Sparkles size={14} />
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

        <div className="hero-art" aria-label="Illustration décorative de notre cocon">
        

          
<img src="/assets/hero.png" alt="" />

        
        </div>
      </section>

      

      <section id="activities" className="activities-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">ALORS, MON AMOUR…</span>
            <h2>On fait quoi ce soir ? <span>♡</span></h2>
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
                  <span className="activity-number">{activity.number}</span>
                  <span className="activity-icon"><Icon size={22} /></span>
                </div>
                <div className="activity-content">
                  <h3>{activity.title}</h3>
                  <p>{activity.description}</p>
                  <Link className="activity-link" href={activity.href}>
                    {activity.label}
                    <ArrowRight size={16} />
                  </Link>
                </div>
                <div className="card-decoration" aria-hidden="true">
                  {activity.number === "01" ? <Gamepad2 size={92} /> : <MoonStar size={100} />}
                </div>
              </article>
            );
          })}
        </div>

        <div className="coming-soon">
          <div className="coming-icon"><Music2 size={20} /></div>
          <div>
            <strong>Et si on prenait juste le temps ?</strong>
            <p>Nos petites attentions et nos souvenirs arrivent bientôt.</p>
          </div>
          <span className="coming-badge">Bientôt</span>
        </div>
      </section>

      <footer className="site-footer">
        <Link href="/" className="footer-brand">oycea<span>.</span></Link>
        <span className="footer-private"><LockKeyhole size={12} /> Notre cocon privé</span>
      </footer>
    </main>
  );
}
