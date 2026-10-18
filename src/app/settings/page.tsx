/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Heart,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

const KEY = "oycea_preferences";

type Preferences = {
  widgetEnabled: boolean;
  theme: "rose" | "cream" | "dark";
  animations: boolean;
  messageNotifications: boolean;
  moodNotifications: boolean;
  sound: boolean;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
};

const DEFAULTS: Preferences = {
  widgetEnabled: true,
  theme: "rose",
  animations: true,
  messageNotifications: true,
  moodNotifications: true,
  sound: false,
  quietHours: false,
  quietStart: "22:00",
  quietEnd: "08:00",
};

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) {
        setPrefs({ ...DEFAULTS, ...JSON.parse(stored) });
      } else {
        setPrefs({
          ...DEFAULTS,
          widgetEnabled:
            localStorage.getItem("oycea_mood_widget_enabled") !== "false",
        });
      }
    } catch {
      setPrefs(DEFAULTS);
    }
  }, []);

  function update<K extends keyof Preferences>(
    key: K,
    value: Preferences[K]
  ) {
    setPrefs((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(prefs));
    localStorage.setItem(
      "oycea_mood_widget_enabled",
      String(prefs.widgetEnabled)
    );

    window.dispatchEvent(new Event("oycea-settings-changed"));
    setSaved(true);
  }

  function reset() {
    setPrefs(DEFAULTS);
    localStorage.setItem(KEY, JSON.stringify(DEFAULTS));
    localStorage.setItem("oycea_mood_widget_enabled", "true");
    window.dispatchEvent(new Event("oycea-settings-changed"));
    setSaved(true);
  }

  const toggleClass =
    "h-5 w-5 accent-[#c66e8d] cursor-pointer";

  return (
    <main className="min-h-screen bg-[#fff9f7] px-4 py-6 text-[#49353d] sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#977781] hover:text-[#49353d]"
          >
            <ArrowLeft size={17} />
            Retour à l&apos;accueil
          </Link>

          <span className="text-2xl font-semibold tracking-tight">
            oycea<span className="text-[#d58ba2]">.</span>
          </span>
        </header>

        <div className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#bd7891]">
            Personnalisation
          </p>
          <h1 className="text-3xl font-bold sm:text-4xl">
            Paramètres
          </h1>
          <p className="mt-2 text-sm text-[#977781]">
            Fais de ton espace Oycea un cocon qui vous ressemble. 💗
          </p>
        </div>

        <div className="space-y-5">
          {/* Widget */}
          <section className="rounded-3xl border border-[#f2dfe6] bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-[#fff0f5] p-3 text-[#bd6787]">
                <Heart />
              </div>
              <div>
                <h2 className="font-bold">Widget du couple</h2>
                <p className="text-sm text-[#977781]">
                  Ton petit raccourci sur l&apos;accueil Oycea
                </p>
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
              <span>
                <span className="block text-sm font-medium">
                  Activer le widget
                </span>
                <span className="mt-1 block text-xs text-[#977781]">
                  Afficher le widget compact sur la page d&apos;accueil.
                </span>
              </span>
              <input
                type="checkbox"
                className={toggleClass}
                checked={prefs.widgetEnabled}
                onChange={(e) =>
                  update("widgetEnabled", e.target.checked)
                }
              />
            </label>
          </section>

         

          {/* Notifications */}
          <section className="rounded-3xl border border-[#f2dfe6] bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-[#fff0f5] p-3 text-[#bd6787]">
                <Bell />
              </div>
              <div>
                <h2 className="font-bold">Notifications</h2>
                <p className="text-sm text-[#977781]">
                  Choisis ce que tu souhaites suivre.
                </p>
              </div>
            </div>

            {(
              [
                ["messageNotifications", "Nouveaux petits messages"],
                ["moodNotifications", "Changements d'humeur"],
                ["sound", "Sons dans l'application"],
                ["quietHours", "Activer les heures silencieuses"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between gap-4 border-b border-[#f8edf1] py-3 last:border-0"
              >
                <span className="text-sm">{label}</span>
                <input
                  type="checkbox"
                  className={toggleClass}
                  checked={prefs[key]}
                  onChange={(e) => update(key, e.target.checked)}
                />
              </label>
            ))}

            {prefs.quietHours && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-sm">
                  De
                  <input
                    type="time"
                    value={prefs.quietStart}
                    onChange={(e) =>
                      update("quietStart", e.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-[#ead6de] p-3"
                  />
                </label>
                <label className="text-sm">
                  À
                  <input
                    type="time"
                    value={prefs.quietEnd}
                    onChange={(e) =>
                      update("quietEnd", e.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-[#ead6de] p-3"
                  />
                </label>
              </div>
            )}

            <p className="mt-4 text-xs leading-5 text-[#977781]">
              Ces réglages enregistrent tes préférences. Les notifications
              push et les heures silencieuses nécessiteront une intégration
              supplémentaire pour être réellement appliquées.
            </p>
          </section>

          {/* Couple */}
          <section className="rounded-3xl border border-[#f2dfe6] bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-xl bg-[#fff0f5] p-3 text-[#bd6787]">
                <Sparkles />
              </div>
              <div>
                <h2 className="font-bold">Mon couple</h2>
                <p className="text-sm text-[#977781]">
                  Humeurs, messages et connexion partenaire.
                </p>
              </div>
            </div>

            <Link
              href="/#little-things"
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#b65f80] hover:underline"
            >
              <Heart size={16} />
              Ouvrir l&apos;espace du couple
            </Link>
          </section>

          {/* Confidentialité */}
          <section className="rounded-3xl border border-[#f2dfe6] bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-xl bg-[#fff0f5] p-3 text-[#bd6787]">
                <ShieldCheck />
              </div>
              <div>
                <h2 className="font-bold">Confidentialité et sécurité</h2>
                <p className="text-sm text-[#977781]">
                  Tes humeurs et messages restent protégés par les règles
                  d&apos;accès Supabase du couple.
                </p>
              </div>
            </div>
            <p className="text-xs leading-5 text-[#977781]">
              Ne partage jamais ton code d&apos;invitation publiquement.
              Les paramètres affichés ici sont locaux à ce navigateur.
            </p>
          </section>

          {/* Enregistrer */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={save}
              className="flex-1 rounded-2xl bg-[#c66e8d] px-5 py-4 font-semibold text-white transition hover:bg-[#b45b7b]"
            >
              Enregistrer mes paramètres
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-2xl border border-[#ead6de] bg-white px-5 py-4 text-sm font-medium hover:bg-[#fff0f5]"
            >
              Réinitialiser
            </button>
          </div>

          {saved && (
            <p role="status" className="text-center text-sm text-[#8c5269]">
              Tes préférences ont été enregistrées ❤️
            </p>
          )}

          <p className="flex items-center justify-center gap-2 pb-6 text-xs text-[#a88a95]">
            <SlidersHorizontal size={14} />
            Oycea - votre petit monde à deux
          </p>
        </div>
      </div>
    </main>
  );
}
