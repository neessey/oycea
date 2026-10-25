
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Heart,
  LoaderCircle,
  Plus,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Challenge = {
  id: string;
  slug: string | null;
  title: string;
  description: string;
  category: string;
  kind: "question" | "action";
  options: string[];
  is_daily: boolean;
  is_builtin: boolean;
  created_by: string | null;
};

type Session = {
  id: string;
  room_code: string;
  challenge_id: string;
  host_id: string;
  guest_id: string | null;
  status: "waiting" | "playing" | "finished";
};

type ResponseRow = {
  id: string;
  session_id: string;
  user_id: string;
  answer: string;
  proof_url: string | null;
  completed_at: string;
};

type View = "catalog" | "mission";

const CATEGORIES = [
  "Toutes",
  "Romantique",
  "Complicité",
  "Action",
  "Découverte",
];

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function DefisPage() {
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState("");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedChallenge, setSelectedChallenge] =
    useState<Challenge | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);

  const [view, setView] = useState<View>("catalog");
  const [category, setCategory] = useState("Toutes");
  const [roomInput, setRoomInput] = useState("");

  const [answer, setAnswer] = useState("");
  const [proofUrl, setProofUrl] = useState("");

  const [customTitle, setCustomTitle] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customCategory, setCustomCategory] = useState("Complicité");
  const [showCreator, setShowCreator] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const loadChallenges = useCallback(async () => {
    const { data, error } = await supabase
      .from("oycea_challenges")
      .select("*")
      .eq("kind", "action")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("Impossible de charger les missions : " + error.message);
      return;
    }

    setChallenges((data ?? []) as Challenge[]);
  }, [supabase]);

  const loadResponses = useCallback(
    async (sessionId: string) => {
      const { data, error } = await supabase
        .from("oycea_challenge_responses")
        .select("*")
        .eq("session_id", sessionId);

      if (error) {
        setMessage("Impossible de charger les réalisations : " + error.message);
        return;
      }

      setResponses((data ?? []) as ResponseRow[]);
    },
    [supabase]
  );

  const loadSession = useCallback(
    async (sessionId: string) => {
      const { data, error } = await supabase
        .from("oycea_challenge_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (error || !data) {
        setMessage("Impossible de retrouver cette mission.");
        return false;
      }

      const current = data as Session;

      const { data: challenge, error: challengeError } = await supabase
        .from("oycea_challenges")
        .select("*")
        .eq("id", current.challenge_id)
        .eq("kind", "action")
        .single();

      if (challengeError || !challenge) {
        setMessage("Cette session ne correspond pas à une mission.");
        return false;
      }

      setSession(current);
      setSelectedChallenge(challenge as Challenge);
      await loadResponses(current.id);
      return true;
    },
    [supabase, loadResponses]
  );

  useEffect(() => {
    let active = true;

    async function initialize() {
      const { data, error } = await supabase.auth.getUser();

      if (!active) return;

      if (error || !data.user) {
        window.location.href = "/login";
        return;
      }

      setUserId(data.user.id);
      await loadChallenges();

      if (!active) return;

      const savedId = sessionStorage.getItem("oycea_defis_session_id");
      const legacyId = sessionStorage.getItem("oycea_challenge_session_id");
      const sessionId = savedId || legacyId;

      if (sessionId) {
        const { data: saved } = await supabase
          .from("oycea_challenge_sessions")
          .select("*")
          .eq("id", sessionId)
          .maybeSingle();

        if (
          active &&
          saved &&
          (saved.host_id === data.user.id ||
            saved.guest_id === data.user.id)
        ) {
          const { data: challenge } = await supabase
            .from("oycea_challenges")
            .select("kind")
            .eq("id", saved.challenge_id)
            .maybeSingle();

          if (!active) return;

          if (challenge?.kind === "action") {
            const restored = await loadSession(saved.id);

            if (active && restored) {
              sessionStorage.setItem("oycea_defis_session_id", saved.id);
              setView("mission");
            }
          } else if (savedId) {
            sessionStorage.removeItem("oycea_defis_session_id");
          }
        } else if (savedId) {
          sessionStorage.removeItem("oycea_defis_session_id");
        }
      }

      if (active) setLoading(false);
    }

    void initialize();

    return () => {
      active = false;
    };
  }, [supabase, loadChallenges, loadSession]);

  useEffect(() => {
    if (!session?.id) return;

    const sessionChannel = supabase
      .channel(`oycea-defis-session-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "oycea_challenge_sessions",
          filter: `id=eq.${session.id}`,
        },
        () => {
          void loadSession(session.id);
        }
      )
      .subscribe();

    const responseChannel = supabase
      .channel(`oycea-defis-responses-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "oycea_challenge_responses",
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          void loadResponses(session.id);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(sessionChannel);
      void supabase.removeChannel(responseChannel);
    };
  }, [session?.id, supabase, loadSession, loadResponses]);
  
  useEffect(() => {
  const channel = supabase
    .channel("oycea-challenges-catalog")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "oycea_challenges",
      },
      () => {
        void loadChallenges();
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}, [supabase, loadChallenges]);

  async function createSession(challenge: Challenge) {
    if (!userId || busy) return;

    setBusy(true);
    setMessage("");

    try {
      let created: Session | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabase
          .from("oycea_challenge_sessions")
          .insert({
            room_code: makeRoomCode(),
            challenge_id: challenge.id,
            host_id: userId,
            status: "waiting",
          })
          .select("*")
          .single();

        if (error) {
          if (error.code === "23505") continue;
          setMessage("Création de la salle impossible : " + error.message);
          return;
        }

        if (!data) continue;

        created = data as Session;
        break;
      }

      if (!created) {
        setMessage("Impossible de créer un code de salle unique. Réessaie.");
        return;
      }

      sessionStorage.setItem("oycea_defis_session_id", created.id);
      setSession(created);
      setSelectedChallenge(challenge);
      setResponses([]);
      setAnswer("");
      setProofUrl("");
      setView("mission");
    } finally {
      setBusy(false);
    }
  }

  async function joinSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (roomInput.trim().length !== 6 || busy) return;

    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc("join_oycea_challenge", {
        p_room_code: roomInput.trim().toUpperCase(),
      });

      if (error) {
        setMessage("Impossible de rejoindre la salle : " + error.message);
        return;
      }

      const joined = Array.isArray(data) ? data[0] : data;

      if (!joined?.id) {
        setMessage("Aucune salle trouvée avec ce code.");
        return;
      }

      const { data: challenge, error: challengeError } = await supabase
        .from("oycea_challenges")
        .select("kind")
        .eq("id", joined.challenge_id)
        .maybeSingle();

      if (challengeError || challenge?.kind !== "action") {
        setMessage(
          "Ce code correspond à une question express, pas à une mission."
        );
        return;
      }

      const restored = await loadSession(joined.id);

      if (!restored) return;

      sessionStorage.setItem("oycea_defis_session_id", joined.id);
      setRoomInput("");
      setView("mission");
    } finally {
      setBusy(false);
    }
  }

  async function createCustomChallenge(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!userId || !customTitle.trim() || !customDescription.trim() || busy) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("oycea_challenges")
        .insert({
          title: customTitle.trim(),
          description: customDescription.trim(),
          category: customCategory,
          kind: "action",
          options: [],
          is_daily: false,
          is_builtin: false,
          created_by: userId,
        })
        .select("*")
        .single();

      if (error) {
        setMessage("Création impossible : " + error.message);
        return;
      }

      setChallenges((current) => [data as Challenge, ...current]);
      setCustomTitle("");
      setCustomDescription("");
      setCustomCategory("Complicité");
      setShowCreator(false);
      setMessage("Ta mission a bien été créée.");
    } finally {
      setBusy(false);
    }
  }

  async function submitResponse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session || !userId || !answer.trim() || busy) return;

    if (session.status !== "playing") {
      setMessage("Ton partenaire doit rejoindre la salle avant de commencer.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const { error } = await supabase
        .from("oycea_challenge_responses")
        .upsert(
          {
            session_id: session.id,
            user_id: userId,
            answer: answer.trim(),
            proof_url: proofUrl.trim() || null,
            completed_at: new Date().toISOString(),
          },
          { onConflict: "session_id,user_id" }
        );

      if (error) {
        setMessage("Impossible d'enregistrer ta réalisation : " + error.message);
        return;
      }

      await loadResponses(session.id);
      setMessage("Ta réalisation est enregistrée.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!session) return;

    try {
      await navigator.clipboard.writeText(session.room_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setMessage("Copie impossible. Note le code affiché.");
    }
  }

  function leaveSession() {
    sessionStorage.removeItem("oycea_defis_session_id");

    // Ne supprime pas le code de session utilisé par Questions express.
    setSession(null);
    setSelectedChallenge(null);
    setResponses([]);
    setAnswer("");
    setProofUrl("");
    setMessage("");
    setView("catalog");
  }

  const myResponse = responses.find((row) => row.user_id === userId);
  const partnerResponse = responses.find((row) => row.user_id !== userId);
  const bothAnswered = Boolean(myResponse && partnerResponse);

  const visibleChallenges =
    category === "Toutes"
      ? challenges
      : challenges.filter((challenge) => challenge.category === category);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fff9f7]">
        <LoaderCircle className="animate-spin text-[#c98298]" size={30} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fff9f7] px-5 py-6 text-[#49353d] sm:px-8 sm:py-9">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#977781] transition hover:text-[#49353d]"
          >
            <ArrowLeft size={17} />
            Notre cocon
          </Link>

          <Link href="/" className="text-2xl font-semibold tracking-tight">
            oycea<span className="text-[#d58ba2]">.</span>
          </Link>
        </header>

        {message && (
          <div
            role="status"
            className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-[#f0d2d9] bg-white px-4 py-3 text-sm leading-6 text-[#a34d68]"
          >
            <p>{message}</p>
            <button
              onClick={() => setMessage("")}
              aria-label="Fermer le message"
              className="shrink-0"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {view === "catalog" && (
          <>
            <section className="relative overflow-hidden rounded-[2rem] bg-[#49353d] px-6 py-9 text-white sm:px-11 sm:py-12">
              <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full border border-white/10" />
              <div className="pointer-events-none absolute -right-3 -top-7 h-48 w-48 rounded-full border border-white/10" />

              <div className="relative max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-[10px] tracking-[0.2em] text-[#f1c4d0]">
                  <Sparkles size={13} />
                  NOTRE CARNET DE MISSIONS
                </span>

                <h1 className="mt-6 text-4xl font-medium leading-tight sm:text-6xl">
                  L&apos;amour, c&apos;est aussi
                  <br />
                  <span className="font-serif italic text-[#e8a9bd]">
                    oser ensemble.
                  </span>
                </h1>

                <p className="mt-5 max-w-lg text-sm leading-7 text-white/70 sm:text-base">
                  Des petites actions, des surprises et des souvenirs à
                  créer. Choisissez une mission et donnez une nouvelle
                  couleur à votre journée.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <a
                    href="#missions"
                    className="inline-flex items-center gap-2 rounded-full bg-[#e8a9bd] px-5 py-3 text-sm font-medium text-[#49353d] transition hover:bg-[#f2bfd0]"
                  >
                    Découvrir les missions
                    <ChevronRight size={16} />
                  </a>

                  <button
                    onClick={() => setShowCreator((value) => !value)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-3 text-sm text-white transition hover:bg-white/10"
                  >
                    <Plus size={16} />
                    Créer la mienne
                  </button>
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#f0dfe3] bg-white p-5">
                <Sparkles size={20} className="text-[#c98298]" />
                <h2 className="mt-4 font-medium">Une mission</h2>
                <p className="mt-2 text-sm leading-6 text-[#907b82]">
                  Choisissez quelque chose à vivre ou à réaliser.
                </p>
              </div>

              <div className="rounded-2xl border border-[#f0dfe3] bg-white p-5">
                <Users size={20} className="text-[#9e91c7]" />
                <h2 className="mt-4 font-medium">À deux</h2>
                <p className="mt-2 text-sm leading-6 text-[#907b82]">
                  Partagez le code et participez chacun à votre rythme.
                </p>
              </div>

              <div className="rounded-2xl border border-[#f0dfe3] bg-white p-5">
                <Heart size={20} className="text-[#c98298]" />
                <h2 className="mt-4 font-medium">Un souvenir</h2>
                <p className="mt-2 text-sm leading-6 text-[#907b82]">
                  Racontez votre expérience et découvrez celle de l&apos,autre.
                </p>
              </div>
            </section>

            <section className="mt-6 rounded-3xl border border-[#f0dfe3] bg-white p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff0f4] text-[#bd7891]">
                  <Users size={21} />
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="font-medium">Rejoindre une mission</h2>
                  <p className="mt-1 text-sm leading-6 text-[#907b82]">
                    Ton partenaire t&apos;a envoyé un code ? Entre-le ici.
                  </p>

                  <form
                    onSubmit={(event) => void joinSession(event)}
                    className="mt-4 flex flex-col gap-3 sm:flex-row"
                  >
                    <input
                      required
                      minLength={6}
                      maxLength={6}
                      value={roomInput}
                      onChange={(event) =>
                        setRoomInput(event.target.value.toUpperCase())
                      }
                      placeholder="CODE À 6 CARACTÈRES"
                      className="min-w-0 flex-1 rounded-xl border border-[#eedde1] bg-[#fffafa] px-4 py-3.5 text-sm uppercase tracking-[0.2em] outline-none focus:border-[#c98298]"
                    />

                    <button
                      disabled={busy || roomInput.trim().length !== 6}
                      className="rounded-xl bg-[#49353d] px-6 py-3.5 text-sm text-white transition hover:bg-[#644653] disabled:opacity-50"
                    >
                      {busy ? "Connexion…" : "Rejoindre"}
                    </button>
                  </form>
                </div>
              </div>
            </section>

            {showCreator && (
              <section className="mt-6 rounded-3xl border border-[#e9d1d8] bg-white p-5 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs tracking-[0.18em] text-[#b28a97]">
                      MISSION PERSONNALISÉE
                    </p>
                    <h2 className="mt-2 text-2xl font-medium">
                      Votre idée, vos règles.
                    </h2>
                  </div>

                  <button
                    onClick={() => setShowCreator(false)}
                    aria-label="Fermer le formulaire"
                    className="rounded-full p-2 text-[#977781] hover:bg-[#fff4f6]"
                  >
                    <X size={19} />
                  </button>
                </div>

                <form
                  onSubmit={(event) => void createCustomChallenge(event)}
                  className="mt-6 space-y-4"
                >
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Nom de la mission
                    </label>
                    <input
                      required
                      maxLength={120}
                      value={customTitle}
                      onChange={(event) => setCustomTitle(event.target.value)}
                      placeholder="Ex. Organiser une surprise"
                      className="w-full rounded-xl border border-[#eedde1] bg-[#fffafa] px-4 py-3.5 text-sm outline-none focus:border-[#c98298]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Instructions
                    </label>
                    <textarea
                      required
                      maxLength={1000}
                      rows={4}
                      value={customDescription}
                      onChange={(event) =>
                        setCustomDescription(event.target.value)
                      }
                      placeholder="Décrivez ce qu'il faut faire…"
                      className="w-full rounded-xl border border-[#eedde1] bg-[#fffafa] px-4 py-3.5 text-sm leading-7 outline-none focus:border-[#c98298]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Catégorie
                    </label>
                    <select
                      value={customCategory}
                      onChange={(event) => setCustomCategory(event.target.value)}
                      className="w-full rounded-xl border border-[#eedde1] bg-white px-4 py-3.5 text-sm outline-none focus:border-[#c98298]"
                    >
                      <option>Complicité</option>
                      <option>Romantique</option>
                      <option>Action</option>
                      <option>Découverte</option>
                    </select>
                  </div>

                  <button
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#c98298] px-6 py-3.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy ? "Enregistrement…" : "Créer cette mission"}
                    <ChevronRight size={16} />
                  </button>
                </form>
              </section>
            )}

            <section id="missions" className="mt-12 scroll-mt-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs tracking-[0.2em] text-[#b28a97]">
                    À VOUS DE JOUER
                  </p>
                  <h2 className="mt-2 text-3xl font-medium">
                    Le catalogue des missions
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#907b82]">
                    {challenges.length} mission(s) à découvrir.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
                {CATEGORIES.map((item) => (
                  <button
                    key={item}
                    onClick={() => setCategory(item)}
                    className={`shrink-0 rounded-full px-4 py-2.5 text-sm transition ${
                      category === item
                        ? "bg-[#49353d] text-white"
                        : "border border-[#eedde1] bg-white text-[#907b82] hover:border-[#c98298]"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {visibleChallenges.map((challenge, index) => (
                  <article
                    key={challenge.id}
                    className="group flex min-h-[285px] flex-col rounded-3xl border border-[#f0dfe3] bg-white p-6 transition duration-200 hover:-translate-y-1 hover:border-[#dfb4c2] hover:shadow-[0_16px_45px_rgba(125,76,91,0.08)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs tracking-[0.15em] text-[#b28a97]">
                        MISSION {String(index + 1).padStart(2, "0")}
                      </span>

                      {challenge.is_daily && (
                        <span className="rounded-full bg-[#f8f0ff] px-3 py-1.5 text-xs text-[#897bb6]">
                          Du jour
                        </span>
                      )}
                    </div>

                    <span className="mt-5 w-fit rounded-full bg-[#fff0f4] px-3 py-1.5 text-xs text-[#ad7187]">
                      {challenge.category}
                    </span>

                    <h3 className="mt-4 text-xl font-medium leading-snug">
                      {challenge.title}
                    </h3>

                    <p className="mt-3 flex-1 text-sm leading-7 text-[#907b82]">
                      {challenge.description}
                    </p>

                    <button
                      onClick={() => void createSession(challenge)}
                      disabled={busy}
                      className="mt-6 flex w-full items-center justify-between rounded-xl bg-[#fff4f6] px-4 py-3.5 text-sm font-medium text-[#ad7187] transition group-hover:bg-[#c98298] group-hover:text-white disabled:opacity-50"
                    >
                      <span>
                        {busy ? "Préparation…" : "Lancer cette mission"}
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  </article>
                ))}
              </div>

              {visibleChallenges.length === 0 && (
                <div className="mt-5 rounded-3xl border border-dashed border-[#e9cbd4] bg-white p-10 text-center">
                  <Sparkles className="mx-auto text-[#c98298]" size={28} />
                  <h3 className="mt-4 font-medium">
                    Aucune mission dans cette catégorie
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#907b82]">
                    Essaie une autre catégorie ou crée ta propre mission.
                  </p>
                  <button
                    onClick={() => setCategory("Toutes")}
                    className="mt-5 text-sm text-[#ad7187] underline"
                  >
                    Voir toutes les missions
                  </button>
                </div>
              )}
            </section>
          </>
        )}

        {view === "mission" && session && selectedChallenge && (
          <section className="mx-auto max-w-3xl">
            <button
              onClick={leaveSession}
              className="mb-6 inline-flex items-center gap-2 text-sm text-[#977781] hover:text-[#49353d]"
            >
              <ArrowLeft size={16} />
              Retour au catalogue
            </button>

            <div className="overflow-hidden rounded-[2rem] border border-[#f0dfe3] bg-white">
              <div className="bg-[#49353d] px-6 py-8 text-white sm:px-9 sm:py-10">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs tracking-[0.2em] text-[#f1c4d0]">
                    {selectedChallenge.category.toUpperCase()} · NOTRE MISSION
                  </span>
                  <Sparkles className="shrink-0 text-[#e8a9bd]" size={24} />
                </div>

                <h1 className="mt-5 text-3xl font-medium leading-tight sm:text-4xl">
                  {selectedChallenge.title}
                </h1>

                <p className="mt-4 max-w-xl text-sm leading-7 text-white/75">
                  {selectedChallenge.description}
                </p>
              </div>

              <div className="space-y-7 p-5 sm:p-8">
                <div className="flex flex-col gap-4 rounded-2xl bg-[#fff9f7] p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs tracking-[0.15em] text-[#ad7187]">
                      CODE DE LA MISSION
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-[0.2em]">
                      {session.room_code}
                    </p>
                  </div>

                  <button
                    onClick={() => void copyCode()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#eedde1] bg-white px-4 py-3 text-sm text-[#ad7187]"
                  >
                    <Copy size={15} />
                    {copied ? "Code copié" : "Copier le code"}
                  </button>
                </div>

                {session.status === "waiting" ? (
                  <div className="rounded-2xl border border-[#f0dfe3] p-7 text-center">
                    <LoaderCircle
                      className="mx-auto animate-spin text-[#c98298]"
                      size={30}
                    />
                    <h2 className="mt-4 font-medium">
                      On attend ton partenaire…
                    </h2>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-[#907b82]">
                      Envoie-lui le code de la mission. Vous pourrez commencer
                      lorsque vous serez tous les deux dans la salle.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-xs tracking-[0.15em] text-[#ad7187]">
                        TON CARNET DE MISSION
                      </p>
                      <h2 className="mt-2 text-2xl font-medium">
                        {myResponse
                          ? "Ta réalisation est enregistrée"
                          : "À toi de jouer"}
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-[#907b82]">
                        Réalise la mission, puis raconte ton expérience.
                        Tu peux ajouter un lien vers une photo souvenir.
                      </p>
                    </div>

                    <form
                      onSubmit={(event) => void submitResponse(event)}
                      className="space-y-4"
                    >
                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Ton compte rendu
                        </label>
                        <textarea
                          required
                          maxLength={5000}
                          rows={5}
                          value={answer}
                          onChange={(event) => setAnswer(event.target.value)}
                          placeholder="Comment as-tu réalisé cette mission ? Raconte ce moment…"
                          className="w-full rounded-2xl border border-[#eedde1] bg-[#fffafa] p-4 text-sm leading-7 outline-none focus:border-[#c98298]"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Photo souvenir (facultatif)
                        </label>
                        <input
                          type="url"
                          value={proofUrl}
                          onChange={(event) => setProofUrl(event.target.value)}
                          placeholder="https://..."
                          className="w-full rounded-xl border border-[#eedde1] bg-[#fffafa] px-4 py-3.5 text-sm outline-none focus:border-[#c98298]"
                        />
                      </div>

                      <button
                        disabled={busy || !answer.trim()}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#c98298] px-5 py-4 text-sm font-medium text-white transition hover:bg-[#b8738c] disabled:opacity-50 sm:w-auto"
                      >
                        {busy ? (
                          <LoaderCircle
                            size={16}
                            className="animate-spin"
                          />
                        ) : (
                          <Check size={16} />
                        )}
                        {myResponse
                          ? "Actualiser ma réalisation"
                          : "Valider ma mission"}
                      </button>
                    </form>

                    <div className="border-t border-[#f3e8ea] pt-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-medium">
                            Nos réalisations
                          </h2>
                          <p className="mt-1 text-sm text-[#907b82]">
                            Le souvenir se construit à deux.
                          </p>
                        </div>

                        <span className="rounded-full bg-[#fff0f4] px-3 py-1.5 text-xs text-[#ad7187]">
                          {responses.length >= 2 ? "2/2 validées" : `${responses.length}/2 validées`}
                        </span>
                      </div>

                      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#f6e9ed]">
                        <div
                          className="h-full rounded-full bg-[#c98298] transition-all"
                          style={{
                            width: `${Math.min(responses.length, 2) * 50}%`,
                          }}
                        />
                      </div>

                      {!bothAnswered ? (
                        <p className="mt-4 text-sm leading-7 text-[#907b82]">
                          {myResponse
                            ? "Ta réalisation est enregistrée. Tu découvriras celle de ton partenaire lorsqu'il aura participé."
                            : "Vos comptes rendus restent cachés jusqu'à ce que vous ayez tous les deux validé votre mission."}
                        </p>
                      ) : (
                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                          {[myResponse, partnerResponse].map((row) =>
                            row ? (
                              <article
                                key={row.id}
                                className="rounded-2xl bg-[#fff9f7] p-5"
                              >
                                <div className="flex items-center gap-2 text-sm font-medium text-[#ad7187]">
                                  <Heart size={15} />
                                  {row.user_id === userId
                                    ? "Ma réalisation"
                                    : "Sa réalisation"}
                                </div>

                                <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                                  {row.answer}
                                </p>

                                {row.proof_url && (
                                  <a
                                    href={row.proof_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-4 inline-block text-sm text-[#ad7187] underline"
                                  >
                                    Voir la photo souvenir
                                  </a>
                                )}
                              </article>
                            ) : null
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        <footer className="mt-14 flex items-center justify-center gap-2 pb-4 text-xs text-[#b29aa1]">
          <Heart size={12} />
          Un petit monde, rien qu&apos;à nous · Oycea
        </footer>
      </div>
    </main>
  );
}
