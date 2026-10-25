
"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { data, error: signupError } =
        await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo:
              typeof window !== "undefined"
                ? `${window.location.origin}/`
                : undefined,
          },
        });

      if (signupError) {
  console.error("Erreur Supabase signup :", {
    code: signupError.code,
    message: signupError.message,
    status: signupError.status,
  });

  setError(`${signupError.code ?? "Erreur"} : ${signupError.message}`);
  return;
}

      if (data.session) {
        router.replace("/");
        router.refresh();
        return;
      }

      setSuccess(
        "Ton inscription est presque terminée ! Consulte ta boîte mail pour confirmer ton adresse e-mail."
      );
    } catch {
      setError("Une erreur est survenue. Vérifie ta connexion Internet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fff8f6] px-5 py-12 text-[#493b40]">
      <section className="w-full max-w-md rounded-[2rem] border border-[#f0e1e3] bg-white p-7 shadow-sm sm:p-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-[#927f84] transition hover:text-[#bd7d91]"
        >
          <ArrowLeft size={16} />
          Retour à l’accueil
        </Link>

        <div className="mb-8 mt-8 text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[#fff0f2]">
            <img
              src="/assets/logoo.png"
              alt="Logo Oycea"
              className="h-full w-full object-contain"
            />
          </div>

          <p className="mb-3 text-xs font-medium uppercase tracking-[0.25em] text-[#bc8292]">
            Notre petit monde
          </p>

          <h1 className="text-3xl font-semibold tracking-tight">
            Bienvenue chez Oycea
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#927f84]">
            Crée ton compte et prépare de jolis moments, même à distance.
          </p>
        </div>

        <form onSubmit={handleSignup} className="space-y-5">
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
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8 caractères minimum"
              className="w-full rounded-xl border border-[#eadfe1] bg-[#fffdfd] px-4 py-3 outline-none transition focus:border-[#c47c91] focus:ring-2 focus:ring-[#f9e5eb]"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-2 block text-sm font-medium"
            >
              Confirmer le mot de passe
            </label>

            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Répète ton mot de passe"
              className="w-full rounded-xl border border-[#eadfe1] bg-[#fffdfd] px-4 py-3 outline-none transition focus:border-[#c47c91] focus:ring-2 focus:ring-[#f9e5eb]"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"
            >
              {error}
            </p>
          )}

          {success && (
            <p
              role="status"
              className="rounded-xl bg-green-50 px-4 py-3 text-sm leading-5 text-green-800"
            >
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#bd7d91] px-5 py-3.5 font-medium text-white transition hover:bg-[#a9687d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Création du compte…" : "Créer mon compte"}
            {!loading && <ArrowRight size={17} />}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[#a18e93]">
          <LockKeyhole size={13} />
          Tes informations restent protégées.
        </div>

        <p className="mt-5 text-center text-sm text-[#927f84]">
          Tu as déjà un compte ?{" "}
          <Link
            href="/login"
            className="font-medium text-[#bd7d91] underline-offset-4 hover:underline"
          >
            Se connecter
          </Link>
        </p>
      </section>
    </main>
  );
}
