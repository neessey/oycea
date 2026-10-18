
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
  LockKeyhole,
  MessageCircleHeart,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import MorpionGame from "../MorpionGame.tsx/page";

type Activity = "menu" | "morpion" | "questions";

type Challenge = {
  id: string;
  title: string;
  description: string;
  category: string;
  kind: "question" | "action";
};

type Session = {
  id: string;
  room_code: string;
  challenge_id: string;
  host_id: string;
  guest_id: string | null;
  status: "waiting" | "playing" | "finished";
};

type CoupleQuestion = {
  id: string;
  session_id: string;
  asked_by: string;
  question: string;
  answer: string | null;
  answered_by: string | null;
  created_at: string;
  answered_at: string | null;
};

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function QuestionsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [activity, setActivity] = useState<Activity>("questions");
  const [userId, setUserId] = useState("");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<CoupleQuestion[]>([]);
  const [roomInput, setRoomInput] = useState("");
  const [questionInput, setQuestionInput] = useState("");
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [answeringId, setAnsweringId] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const loadChallenges = useCallback(async () => {
    const { data, error } = await supabase
      .from("oycea_challenges")
      .select("id,title,description,category,kind")
      .eq("kind", "question")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("Impossible de charger les questions proposées.");
      return;
    }

    setChallenges((data ?? []) as Challenge[]);
  }, [supabase]);

  const loadQuestions = useCallback(async (sessionId: string) => {
    const { data, error } = await supabase
      .from("oycea_couple_questions")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(
        "Impossible de charger les questions. Vérifie la table Supabase oycea_couple_questions."
      );
      return;
    }

    setQuestions((data ?? []) as CoupleQuestion[]);
  }, [supabase]);

  const loadSession = useCallback(async (sessionId: string) => {
    const { data, error } = await supabase
      .from("oycea_challenge_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (error || !data) {
      setMessage("Impossible de retrouver cette salle.");
      return;
    }

    setSession(data as Session);
    await loadQuestions(sessionId);
  }, [supabase, loadQuestions]);

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

      const savedId = sessionStorage.getItem("oycea_challenge_session_id");

      if (savedId) {
        const { data: saved } = await supabase
          .from("oycea_challenge_sessions")
          .select("*")
          .eq("id", savedId)
          .maybeSingle();

        if (
          active &&
          saved &&
          (saved.host_id === data.user.id || saved.guest_id === data.user.id)
        ) {
          const { data: challenge } = await supabase
            .from("oycea_challenges")
            .select("kind")
            .eq("id", saved.challenge_id)
            .maybeSingle();

          if (challenge?.kind === "question") {
            await loadSession(saved.id);
          } else {
            sessionStorage.removeItem("oycea_challenge_session_id");
          }
        } else {
          sessionStorage.removeItem("oycea_challenge_session_id");
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
      .channel(`couple-session-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "oycea_challenge_sessions",
          filter: `id=eq.${session.id}`,
        },
        () => void loadSession(session.id)
      )
      .subscribe();

    const questionsChannel = supabase
      .channel(`couple-questions-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "oycea_couple_questions",
          filter: `session_id=eq.${session.id}`,
        },
        () => void loadQuestions(session.id)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(sessionChannel);
      void supabase.removeChannel(questionsChannel);
    };
  }, [session?.id, supabase, loadSession, loadQuestions]);

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

        if (error?.code === "23505") continue;

        if (error || !data) {
          setMessage(error?.message ?? "Impossible de créer la salle.");
          return;
        }

        created = data as Session;
        break;
      }

      if (!created) {
        setMessage("Impossible de créer un code de salle. Réessaie.");
        return;
      }

      sessionStorage.setItem("oycea_challenge_session_id", created.id);
      setSession(created);
      setQuestions([]);
      setAnswerDrafts({});
      setQuestionInput("");
    } finally {
      setBusy(false);
    }
  }

  async function joinSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!roomInput.trim() || busy) return;

    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc("join_oycea_challenge", {
        p_room_code: roomInput.trim().toUpperCase(),
      });

      if (error) {
        setMessage("Impossible de rejoindre cette salle : " + error.message);
        return;
      }

      const joined = Array.isArray(data) ? data[0] : data;

      if (!joined?.id) {
        setMessage("Aucune salle trouvée avec ce code.");
        return;
      }

      const { data: challenge } = await supabase
        .from("oycea_challenges")
        .select("kind")
        .eq("id", joined.challenge_id)
        .maybeSingle();

      if (challenge?.kind !== "question") {
        setMessage("Ce code correspond à un défi, pas à Questions express.");
        return;
      }

      sessionStorage.setItem("oycea_challenge_session_id", joined.id);
      setRoomInput("");
      await loadSession(joined.id);
    } finally {
      setBusy(false);
    }
  }

  async function askQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session || !userId || !questionInput.trim() || busy) return;

    if (session.status !== "playing") {
      setMessage("Attends que ton partenaire rejoigne la salle.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const { error } = await supabase
        .from("oycea_couple_questions")
        .insert({
          session_id: session.id,
          asked_by: userId,
          question: questionInput.trim(),
        });

      if (error) {
        setMessage("Envoi impossible : " + error.message);
        return;
      }

      setQuestionInput("");
      await loadQuestions(session.id);
      setMessage("Ta question a été envoyée à ton partenaire 💌");
    } finally {
      setBusy(false);
    }
  }

  async function answerQuestion(question: CoupleQuestion) {
    const answer = (answerDrafts[question.id] ?? "").trim();

    if (!answer || !userId || answeringId) return;

    setAnsweringId(question.id);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("oycea_couple_questions")
        .update({
          answer,
          answered_by: userId,
          answered_at: new Date().toISOString(),
        })
        .eq("id", question.id)
        .is("answered_by", null)
        .select("id")
        .maybeSingle();

      if (error) {
        setMessage("Impossible d'enregistrer ta réponse : " + error.message);
        return;
      }

      if (!data) {
        setMessage("Cette question a déjà reçu une réponse.");
        await loadQuestions(question.session_id);
        return;
      }

      setAnswerDrafts((current) => ({ ...current, [question.id]: "" }));
      await loadQuestions(question.session_id);
      setMessage("Réponse envoyée avec amour 💗");
    } finally {
      setAnsweringId("");
    }
  }

  async function copyCode() {
    if (!session) return;

    try {
      await navigator.clipboard.writeText(session.room_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage("Copie impossible. Recopie le code affiché.");
    }
  }

  function leaveSession() {
    sessionStorage.removeItem("oycea_challenge_session_id");
    setSession(null);
    setQuestions([]);
    setAnswerDrafts({});
    setQuestionInput("");
    setMessage("");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fff8f7]">
        <LoaderCircle className="animate-spin text-[#cb7896]" size={30} />
      </main>
    );
  }

  if (activity === "morpion") {
    return <MorpionGame onBack={() => setActivity("questions")} />;
  }

  const myQuestions = questions.filter((q) => q.asked_by === userId);
  const receivedQuestions = questions.filter((q) => q.asked_by !== userId);
  const unanswered = receivedQuestions.filter((q) => !q.answered_by);
  const answered = questions.filter((q) => q.answered_by);
  const isHost = session?.host_id === userId;

  return (
    <main className="min-h-screen overflow-hidden bg-[#fff8f7] text-[#49343e]">
      <div className="pointer-events-none absolute left-0 top-24 h-64 w-64 rounded-full bg-[#f8dce5] opacity-40 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-96 h-72 w-72 rounded-full bg-[#f8e8d9] opacity-50 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-8">
        <header className="mb-10 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#927782] transition hover:text-[#49343e]"
          >
            <ArrowLeft size={17} />
            Notre cocon
          </Link>
          <Link href="/" className="text-2xl font-semibold tracking-tight">
            oycea<span className="text-[#d78ca5]">.</span>
          </Link>
        </header>

        {message && (
          <div
            role="status"
            className="mb-6 flex items-start gap-3 rounded-2xl border border-[#f0d8e0] bg-white/90 px-4 py-3 text-sm text-[#9c5870] shadow-sm"
          >
            <Heart size={17} className="mt-0.5 shrink-0" />
            <p>{message}</p>
          </div>
        )}

        {!session ? (
          <>
            <section className="relative mb-8 overflow-hidden rounded-[2rem] bg-[#563c49] px-6 py-8 text-white sm:px-10 sm:py-12">
              <div className="absolute -right-12 -top-16 h-64 w-64 rounded-full border border-white/10" />
              <div className="absolute -right-2 -top-6 h-44 w-44 rounded-full border border-white/10" />
              <div className="relative max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs tracking-wide text-[#f8d9e3]">
                  <Heart size={13} />
                  VOTRE PETIT JARDIN SECRET
                </span>
                <h1 className="mt-6 text-4xl font-medium leading-tight sm:text-6xl">
                  Et si on apprenait
                  <br />
                  <span className="font-serif italic text-[#f2b9cd]">
                    encore à s’aimer ?
                  </span>
                </h1>
                <p className="mt-5 max-w-lg text-sm leading-7 text-white/75 sm:text-base">
                  Pose une question, découvre sa façon de penser et partage
                  ces petites choses qu’on ne se dit pas toujours.
                </p>
                <div className="mt-7 flex flex-wrap gap-3 text-xs text-white/80">
                  <span className="rounded-full bg-white/10 px-3 py-2">💌 Questions personnalisées</span>
                  <span className="rounded-full bg-white/10 px-3 py-2">🤍 Réponses à deux</span>
                  <span className="rounded-full bg-white/10 px-3 py-2">🌙 Même à distance</span>
                </div>
              </div>
            </section>

            <div className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
              <section className="rounded-[1.75rem] border border-[#f0dfe4] bg-white/90 p-5 shadow-[0_15px_45px_rgba(105,63,79,0.04)] sm:p-7">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff0f4] text-[#c77994]">
                    <MessageCircleHeart size={23} />
                  </div>
                  <div>
                    <h2 className="text-xl font-medium">Créer notre espace</h2>
                    <p className="mt-1 text-sm leading-6 text-[#947d86]">
                      Choisis une question de départ, puis invite ton partenaire
                      avec un code privé.
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {challenges.slice(0, 3).map((challenge) => (
                    <button
                      key={challenge.id}
                      onClick={() => void createSession(challenge)}
                      disabled={busy}
                      className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-[#f0e3e7] bg-[#fffafa] p-4 text-left transition hover:border-[#dfadbd] hover:bg-[#fff2f5] disabled:opacity-50"
                    >
                      <div>
                        <p className="text-xs text-[#bb8196]">{challenge.category}</p>
                        <p className="mt-1 font-medium">{challenge.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm leading-5 text-[#947d86]">
                          {challenge.description}
                        </p>
                      </div>
                      <ChevronRight className="shrink-0 text-[#c98298] transition group-hover:translate-x-1" size={20} />
                    </button>
                  ))}
                </div>

                {challenges.length === 0 && (
                  <p className="mt-5 rounded-2xl bg-[#fff7f8] p-4 text-sm leading-6 text-[#947d86]">
                    Aucune question de départ disponible. Ajoute au moins une
                    entrée avec kind = question dans oycea_challenges.
                  </p>
                )}

                {busy && (
                  <p className="mt-4 flex items-center gap-2 text-sm text-[#a77889]">
                    <LoaderCircle className="animate-spin" size={16} />
                    Préparation de votre espace…
                  </p>
                )}
              </section>

              <div className="space-y-5">
                <section className="rounded-[1.75rem] border border-[#f0dfe4] bg-white/90 p-5 shadow-[0_15px_45px_rgba(105,63,79,0.04)] sm:p-7">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3edff] text-[#9480c5]">
                    <Users size={23} />
                  </div>
                  <h2 className="mt-4 text-xl font-medium">Il t’a déjà envoyé un code ?</h2>
                  <p className="mt-2 text-sm leading-6 text-[#947d86]">
                    Entre son code pour retrouver votre espace et répondre à
                    ses questions.
                  </p>
                  <form onSubmit={(event) => void joinSession(event)} className="mt-5">
                    <input
                      value={roomInput}
                      onChange={(event) => setRoomInput(event.target.value.toUpperCase())}
                      maxLength={6}
                      required
                      placeholder="ENTRE LE CODE"
                      className="w-full rounded-2xl border border-[#eddae1] bg-[#fffafa] px-4 py-4 text-center text-lg font-semibold uppercase tracking-[0.25em] outline-none transition placeholder:text-sm placeholder:font-normal placeholder:tracking-normal focus:border-[#cb7896]"
                    />
                    <button
                      disabled={busy}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#563c49] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#6a4858] disabled:opacity-50"
                    >
                      {busy ? <LoaderCircle className="animate-spin" size={17} /> : <Heart size={16} />}
                      Rejoindre notre espace
                    </button>
                  </form>
                </section>

                <button
                  onClick={() => setActivity("morpion")}
                  className="flex w-full items-center gap-4 rounded-[1.5rem] border border-[#f0dfe4] bg-white/90 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff0f4] text-[#c77994]">
                    <Sparkles size={21} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Envie d’un petit jeu ?</p>
                    <p className="mt-1 text-sm text-[#947d86]">Retrouve votre partie de morpion.</p>
                  </div>
                  <ChevronRight size={18} className="text-[#c98298]" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <section className="mx-auto max-w-4xl">
            <button
              onClick={leaveSession}
              className="mb-5 inline-flex items-center gap-2 text-sm text-[#927782] transition hover:text-[#49343e]"
            >
              <ArrowLeft size={16} />
              Quitter cet espace
            </button>

            <div className="overflow-hidden rounded-[2rem] border border-[#f0dfe4] bg-white shadow-[0_18px_60px_rgba(105,63,79,0.06)]">
              <div className="relative overflow-hidden bg-[#563c49] px-5 py-7 text-white sm:px-8">
                <div className="absolute -right-8 -top-14 h-48 w-48 rounded-full border border-white/10" />
                <div className="relative flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs tracking-[0.2em] text-[#f2c6d5]">VOTRE CONVERSATION</p>
                    <h1 className="mt-3 text-3xl font-medium sm:text-4xl">
                      Un peu plus près <span className="font-serif italic text-[#f2b9cd]">de toi.</span>
                    </h1>
                    <p className="mt-3 max-w-md text-sm leading-6 text-white/70">
                      Les meilleures conversations commencent parfois par une seule question.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
                    <Heart className="text-[#f2b9cd]" size={25} />
                  </div>
                </div>

                <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/10 p-4">
                  <div>
                    <p className="text-[11px] tracking-widest text-white/60">CODE DE VOTRE ESPACE</p>
                    <p className="mt-1 text-2xl font-semibold tracking-[0.22em]">{session.room_code}</p>
                  </div>
                  <button
                    onClick={() => void copyCode()}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-[#563c49] transition hover:bg-[#fff0f4]"
                  >
                    <Copy size={15} />
                    {copied ? "Copié !" : "Copier le code"}
                  </button>
                </div>
              </div>

              <div className="grid gap-0 md:grid-cols-[0.8fr_1.2fr]">
                <aside className="border-b border-[#f3e7eb] bg-[#fffafb] p-5 sm:p-6 md:border-b-0 md:border-r">
                  <p className="text-xs font-medium tracking-widest text-[#b98598]">VOTRE PETIT CERCLE</p>
                  <div className="mt-5 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f8dce6] text-[#a95574]">
                      <Heart size={19} fill="currentColor" />
                    </div>
                    <div>
                      <p className="font-medium">Toi</p>
                      <p className="text-xs text-[#9b828c]">{isHost ? "Créateur·rice de la salle" : "Invité·e"}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-full ${session.guest_id ? "bg-[#e8e0fa] text-[#8873bd]" : "bg-[#f1e9ec] text-[#a48e96]"}`}>
                      <Users size={19} />
                    </div>
                    <div>
                      <p className="font-medium">Ton partenaire</p>
                      <p className="text-xs text-[#9b828c]">
                        {session.guest_id ? "Connecté à votre espace" : "Pas encore arrivé"}
                      </p>
                    </div>
                  </div>

                  {session.status !== "playing" && (
                    <div className="mt-6 rounded-2xl border border-[#f0dce3] bg-white p-4">
                      <div className="flex items-center gap-2 text-[#ba7791]">
                        <LoaderCircle className="animate-spin" size={17} />
                        <p className="text-sm font-medium">On attend ta moitié…</p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#947d86]">
                        Envoie-lui le code ci-dessus. Dès qu’il ou elle rejoint,
                        vous pourrez vous poser vos questions.
                      </p>
                    </div>
                  )}

                  <div className="mt-6 rounded-2xl bg-[#f8efff] p-4">
                    <div className="flex items-center gap-2 text-[#8d78bb]">
                      <LockKeyhole size={16} />
                      <p className="text-sm font-medium">Votre bulle à vous</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#8b7d9f]">
                      Les questions de cet espace sont réservées aux deux membres de la salle.
                    </p>
                  </div>

                  <div className="mt-6 flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff0f4] text-[#c77994]">
                      <MessageCircleHeart size={19} />
                    </div>
                    <div>
                      <p className="font-medium">Le principe</p>
                      <p className="mt-1 text-sm leading-6 text-[#947d86]">
                        Pose une question. Ton partenaire répond. Puis inversez les rôles !
                      </p>
                    </div>
                  </div>
                </aside>

                <div className="min-w-0 p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-medium">Vos questions</h2>
                      <p className="mt-1 text-sm text-[#947d86]">
                        {questions.length} question{questions.length > 1 ? "s" : ""} partagée{questions.length > 1 ? "s" : ""}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#fff0f4] px-3 py-1.5 text-xs text-[#b76f8a]">
                      {unanswered.length} en attente
                    </span>
                  </div>

                  {session.status === "playing" && (
                    <form onSubmit={(event) => void askQuestion(event)} className="mt-5 rounded-2xl border border-[#efdce2] bg-[#fffafb] p-4">
                      <label htmlFor="couple-question" className="text-sm font-medium">
                        Qu’est-ce que tu veux lui demander ?
                      </label>
                      <textarea
                        id="couple-question"
                        value={questionInput}
                        onChange={(event) => setQuestionInput(event.target.value)}
                        maxLength={1000}
                        required
                        rows={3}
                        placeholder="Ex. Quel est ton plus beau souvenir avec moi ? 💗"
                        className="mt-3 w-full resize-y rounded-xl border border-[#efdee4] bg-white p-3.5 text-sm leading-6 outline-none transition placeholder:text-[#b5a1a8] focus:border-[#cb7896]"
                      />
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-xs text-[#a18b94]">{questionInput.length}/1000</p>
                        <button
                          disabled={busy || !questionInput.trim()}
                          className="inline-flex items-center gap-2 rounded-xl bg-[#c77994] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#b56884] disabled:opacity-50"
                        >
                          {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={15} />}
                          Envoyer ma question
                        </button>
                      </div>
                    </form>
                  )}

                  {session.status === "playing" && questions.length === 0 && (
                    <div className="mt-6 rounded-2xl border border-dashed border-[#e9cbd6] px-5 py-8 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#fff0f4] text-[#c77994]">
                        <MessageCircleHeart size={25} />
                      </div>
                      <h3 className="mt-4 font-medium">À vous de commencer 💌</h3>
                      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#947d86]">
                        Écris ta première question. Elle apparaîtra ici pour ton partenaire.
                      </p>
                    </div>
                  )}

                  {session.status === "playing" && questions.length > 0 && (
                    <div className="mt-5 space-y-4">
                      {questions.map((question, index) => {
                        const mine = question.asked_by === userId;
                        const canAnswer = !mine && !question.answered_by;

                        return (
                          <article
                            key={question.id}
                            className={`rounded-2xl border p-4 ${
                              mine
                                ? "border-[#f0dce3] bg-[#fff7f9]"
                                : "border-[#e7def5] bg-[#fbf9ff]"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${mine ? "bg-[#f7dce6] text-[#ae5e7c]" : "bg-[#e9e0fa] text-[#8a73bb]"}`}>
                                {mine ? <Heart size={16} /> : <MessageCircleHeart size={17} />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-xs font-medium text-[#947d86]">
                                    {mine ? "Tu as demandé" : "Question pour toi"} · #{index + 1}
                                  </p>
                                  <span className={`rounded-full px-2.5 py-1 text-[11px] ${question.answered_by ? "bg-[#e7f5ed] text-[#4c8966]" : "bg-white text-[#a17f8d]"}`}>
                                    {question.answered_by ? "Répondu" : mine ? "En attente" : "À répondre"}
                                  </span>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap break-words text-sm font-medium leading-6">
                                  {question.question}
                                </p>

                                {question.answer && (
                                  <div className="mt-3 rounded-xl border border-white bg-white/80 p-3">
                                    <p className="flex items-center gap-2 text-xs font-medium text-[#9b6c80]">
                                      <Heart size={13} />
                                      {question.answered_by === userId ? "Ta réponse" : "Sa réponse"}
                                    </p>
                                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#604b54]">
                                      {question.answer}
                                    </p>
                                  </div>
                                )}

                                {canAnswer && (
                                  <div className="mt-3">
                                    <textarea
                                      rows={2}
                                      maxLength={3000}
                                      value={answerDrafts[question.id] ?? ""}
                                      onChange={(event) =>
                                        setAnswerDrafts((current) => ({
                                          ...current,
                                          [question.id]: event.target.value,
                                        }))
                                      }
                                      placeholder="Écris ta réponse ici…"
                                      className="w-full rounded-xl border border-[#e7def0] bg-white p-3 text-sm leading-6 outline-none focus:border-[#a18acb]"
                                    />
                                    <div className="mt-2 flex justify-end">
                                      <button
                                        type="button"
                                        onClick={() => void answerQuestion(question)}
                                        disabled={answeringId === question.id || !(answerDrafts[question.id] ?? "").trim()}
                                        className="inline-flex items-center gap-2 rounded-xl bg-[#8872b7] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#7660a4] disabled:opacity-50"
                                      >
                                        {answeringId === question.id ? (
                                          <LoaderCircle className="animate-spin" size={15} />
                                        ) : (
                                          <Check size={15} />
                                        )}
                                        Envoyer ma réponse
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {mine && !question.answered_by && (
                                  <p className="mt-3 text-xs leading-5 text-[#a1828e]">
                                    Ta question attend sa réponse. Elle s’affichera ici dès qu’elle sera envoyée.
                                  </p>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {answered.length > 0 && (
                    <div className="mt-6 flex items-center gap-2 rounded-xl bg-[#f3f8f3] p-3 text-sm text-[#60836a]">
                      <Heart size={16} />
                      Vous avez déjà partagé {answered.length} réponse{answered.length > 1 ? "s" : ""}. Continuez à vous découvrir !
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        <footer className="mt-10 flex items-center justify-center gap-2 pb-4 text-xs text-[#b29aa1]">
          <Heart size={12} />
          Un petit monde, rien qu’à nous · Oycea
        </footer>
      </div>
    </main>
  );
}
