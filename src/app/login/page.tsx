/* eslint-disable @next/next/no-html-link-for-pages */

"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();

      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (loginError) {
        setError("Adresse e-mail ou mot de passe incorrect.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Connexion impossible. Vérifie ta connexion Internet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fff8f6] px-5 py-12 text-[#493b40]">
      <section className="w-full max-w-md rounded-[2rem] border border-[#f0e1e3] bg-white p-7 shadow-sm sm:p-10">
       

        <div className="mb-8 mt-10 text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[#fff0f2] text-3xl">
            <img src="/assets/logoo.png" alt="logo" />
          </div>

          <p className="mb-3 text-xs font-medium uppercase tracking-[0.25em] text-[#bc8292]">
            Notre petit monde
          </p>

          <h1 className="text-3xl font-semibold tracking-tight">
            Contente de te revoir
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#927f84]">
            Un endroit rien qu’à nous, même à des kilomètres.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium"
            >
              Adresse e-mail
            </label>

            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vous@exemple.com"
              className="w-full rounded-xl border border-[#eadfe1] bg-[#fffdfd] px-4 py-3 outline-none transition focus:border-[#c47c91] focus:ring-2 focus:ring-[#f9e5eb]"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium"
            >
              Mot de passe
            </label>

            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Ton mot de passe"
              className="w-full rounded-xl border border-[#eadfe1] bg-[#fffdfd] px-4 py-3 outline-none transition focus:border-[#c47c91] focus:ring-2 focus:ring-[#f9e5eb]"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#bd7d91] px-5 py-3.5 font-medium text-white transition hover:bg-[#a9687d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Connexion en cours…" : "Entrer dans notre monde"}
          </button>
        </form>

        <p className="mt-7 text-center text-xs leading-5 text-[#a18e93]">
          Un espace privé, réservé à nous deux.
        </p>
      </section>
    </main>
  );
}
