
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Gamepad2,
  Heart,
  LoaderCircle,
  MessageCircleHeart,
  Sparkles,
  Users,
  X
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import MorpionGame from "./MorpionGame.tsx/page";
import CheckersGame from "./CheckersGame.tsx/page";
import PuzzleGame from "./PuzzleGame.tsx/page";
import FourInARowGame from "./FourInARowGame.tsx/page";
import LinkedAdventureGame from "./LinkedAdventureGame.tsx/page";
import LudoGame from "./LudoGame.tsx/page";
import FindNumberGame from "./FindNumberGame.tsx/page";
import DrawingMysteryGame from "./DrawingMysteryGame.tsx/page";
import MemoryGame from "./MemoryGame.tsx/page";

type Activity =
  | "menu"
  | "morpion"
  | "dames"
  | "puzzle"
  | "linked"
  | "ludo"
  | "forinarow"
  | "memory"
  | "findnumber"
  | "drawingmystery"
  | "defis"

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

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

type GamePageMode = "menu" | "defis" ;

export default function GamesExperience({
  initialActivity = "menu",
}: {
  initialActivity?: GamePageMode;
}) {
      const supabase = useMemo(() => createClient(), []);

const [activity, setActivity] = useState<Activity>(initialActivity);
const [openedGame, setOpenedGame] = useState<GameCard | null>(null);
  const [userId, setUserId] = useState("");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedChallenge, setSelectedChallenge] =
    useState<Challenge | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [answer, setAnswer] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customCategory, setCustomCategory] = useState("Complicité");
  const [customKind, setCustomKind] =
    useState<"question" | "action">("action");
  const [showCreator, setShowCreator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const loadChallenges = useCallback(async () => {
    const { data, error } = await supabase
      .from("oycea_challenges")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("Impossible de charger les défis : " + error.message);
      return;
    }

    setChallenges((data ?? []) as Challenge[]);
  }, [supabase]);

  const loadResponses = useCallback(async (sessionId: string) => {
    const { data, error } = await supabase
      .from("oycea_challenge_responses")
      .select("*")
      .eq("session_id", sessionId);

    if (error) {
      setMessage("Impossible de charger les réponses : " + error.message);
      return;
    }

    setResponses((data ?? []) as ResponseRow[]);
  }, [supabase]);

  const loadSession = useCallback(async (sessionId: string) => {
    const { data, error } = await supabase
      .from("oycea_challenge_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (error || !data) {
      setMessage("Impossible de retrouver cette session.");
      return;
    }

    const current = data as Session;
    setSession(current);

    const { data: challenge } = await supabase
      .from("oycea_challenges")
      .select("*")
      .eq("id", current.challenge_id)
      .single();

    if (challenge) setSelectedChallenge(challenge as Challenge);

    await loadResponses(current.id);
  }, [supabase, loadResponses]);

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
    await loadSession(saved.id);

    const { data: savedChallenge } = await supabase
      .from("oycea_challenges")
      .select("kind")
      .eq("id", saved.challenge_id)
      .maybeSingle();

    if (active) {
      setActivity("defis");
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
      .channel(`oycea-challenge-session-${session.id}`)
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
      .channel(`oycea-challenge-responses-${session.id}`)
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

async function createSession(
  challenge: Challenge,
  targetActivity: "defis"  = "defis"
) {
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
          setMessage(error.message);
          return;
        }

        if (!data) {
          setMessage("Impossible de créer la session.");
          return;
        }

        created = data as Session;
        break;
      }

      if (!created) {
        setMessage((current) => current || "Impossible de créer la session.");
        return;
      }

      sessionStorage.setItem("oycea_challenge_session_id", created.id);
      setSession(created);
      setSelectedChallenge(challenge);
      setResponses([]);
      setAnswer("");
      setProofUrl("");
setActivity(targetActivity);
    } finally {
      setBusy(false);
    }
  }


async function joinSession(
  targetActivity: "defis"  = "defis"
) {
  if (!roomInput.trim() || busy) return;

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
      setMessage("Aucune session trouvée avec ce code.");
      return;
    }

    sessionStorage.setItem("oycea_challenge_session_id", joined.id);

    await loadSession(joined.id);

    const { data: joinedChallenge, error: challengeError } = await supabase
      .from("oycea_challenges")
      .select("kind")
      .eq("id", joined.challenge_id)
      .maybeSingle();

    if (challengeError) {
      setMessage("La salle est rejointe, mais le type de jeu n'a pas pu être chargé.");
    }

   

    setRoomInput("");
  } finally {
    setBusy(false);
  }
}

  async function createCustomChallenge(event: React.FormEvent<HTMLFormElement>) {
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
          kind: customKind,
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
      setShowCreator(false);
      setMessage("Ton défi a bien été enregistré.");
    } finally {
      setBusy(false);
    }
  }

  async function submitResponse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session || !userId || !answer.trim() || busy) return;

    if (session.status !== "playing") {
      setMessage("Ton partenaire doit rejoindre la session avant de répondre.");
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
        setMessage("Impossible d'enregistrer ta réponse : " + error.message);
        return;
      }

      await loadResponses(session.id);
      setMessage("Ta réponse est enregistrée.");
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
    sessionStorage.removeItem("oycea_challenge_session_id");
    setSession(null);
    setSelectedChallenge(null);
    setResponses([]);
    setAnswer("");
    setProofUrl("");
    setMessage("");
    setActivity("menu");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fff9f7]">
        <LoaderCircle className="animate-spin text-[#c98298]" size={28} />
      </main>
    );
  }


  if (activity === "dames") {
  return <CheckersGame onBack={() => setActivity("menu")} />;
}

if (activity === "puzzle") {
  return <PuzzleGame onBack={() => setActivity("menu")} />;
}

if (activity === "forinarow") {
  return <FourInARowGame onBack={() => setActivity("menu")} />;
}

  if (activity === "morpion") {
    return <MorpionGame onBack={() => setActivity("menu")} />;
  }

if (activity === "linked") {
  return <LinkedAdventureGame onBack={() => setActivity("menu")} />;
}

if (activity === "ludo") {
  return <LudoGame onBack={() => setActivity("menu")} />;
}

if (activity === "memory") {
  return (
    <MemoryGame
      onBack={() => setActivity("menu")}
    />
  );
}

if (activity === "findnumber") {
  return <FindNumberGame onBack={() => setActivity("menu")} />;
}
 
if (activity === "drawingmystery") {
  return (
    <DrawingMysteryGame
      onBack={() => setActivity("menu")}
    />
  );
}


  const myResponse = responses.find((row) => row.user_id === userId);
  const partnerResponse = responses.find((row) => row.user_id !== userId);
  const bothAnswered = Boolean(myResponse && partnerResponse);
  const isHost = session?.host_id === userId;

  type GameCard = {
  key: Activity;
  title: string;
  short: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
};

const games: GameCard[] = [

  {
    key: "dames",
    title: "Jeu de dames",
    short: "Capture les pions de ton partenaire.",
    description:
      "Déplace tes pions, capture ceux de ton partenaire et deviens la reine du plateau. Un duel stratégique pour les soirées calmes.",
    icon: <Gamepad2 size={40} />,
  },
  {
    key: "puzzle",
    title: "Puzzle à deux",
    short: "Assemblez la même image ensemble.",
    description:
      "Assemblez la même image ensemble, chacun sur son téléphone. Un moment collaboratif pour avancer main dans la main.",
    icon: <Gamepad2 size={40} />,
  },
  {
    key: "forinarow",
    title: "Puissance 4",
    short: "Alignez quatre jetons avant l'autre.",
    description:
      "Alignez quatre jetons avant votre partenaire dans ce duel stratégique à deux. Simple à comprendre, difficile à lâcher.",
    icon: <Gamepad2 size={40} />,
  },
  
{
  key: "findnumber",
  title: "Find the Number",
  short: "Devine le code secret de ton partenaire.",
  description:
    "Choisissez chacun un code secret de quatre chiffres et tentez de découvrir celui de votre partenaire. Des indices vous aideront à trouver les bons chiffres et leur position.",
  icon: <Gamepad2 size={40} />,
},

{
  key: "drawingmystery",
  title: "Dessin Mystère",
  short: "Dessine, devine et surprends ton partenaire.",
  description:
    "Un mot secret, un crayon et un temps limité. Dessine ce que tu vois et laisse ton partenaire deviner. À vous de jouer !",
  icon: <Sparkles size={40} />,
},
{
  key: "memory",
  title: "Memory Classique",
  description: "Retrouve les 12 paires de cartes et défie ton adversaire.",
  short: "Retrouve les 12 paires de cartes et défie ton adversaire.",
  icon: <Gamepad2 size={40} />,
},

    {
    key: "morpion",
    title: "Morpion",
    short: "Une petite compétition, juste vous deux.",
    description:
      "Alignez trois symboles avant votre partenaire. Un classique rapide pour se taquiner et rigoler, même à distance.",
    icon: <Gamepad2 size={40} />,
  },
  {
    key: "linked",
    title: "Liés pour avancer",
    short: "Franchir tous les obstacles ensemble.",
    description:
      "Deux personnages, cinq niveaux et une seule mission : franchir tous les obstacles ensemble. Si l'un tombe, vous recommencez à deux.",
    icon: <Heart size={40} />,
  },
  {
    key: "ludo",
    title: "Ludo",
    short: "Lance le dé et défie ton partenaire.",
    description:
      "Lance le dé, avance tes pions et défie ton partenaire. Une partie multijoueur pour jouer ensemble, même à distance.",
    icon: <Gamepad2 size={40} />,
  },
  {
    key: "defis",
    title: "Nos défis",
    short: "Des missions romantiques et des confidences.",
    description:
      "Des missions romantiques, des confidences et vos propres idées. Choisissez un défi, créez une salle et partagez le code avec votre partenaire.",
    icon: <Sparkles size={40} />,
    href: "/games/defis",
  },
 
];

  return (
    <main className="min-h-screen bg-[#fff9f7] px-5 py-8 text-[#49353d] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#977781] hover:text-[#49353d]"
          >
            <ArrowLeft size={17} />
            Notre cocon
          </Link>
          <Link href="/" className="text-2xl font-semibold tracking-tight">
            oycea<span className="text-[#d58ba2]">.</span>
          </Link>
        </header>

        {message && (
          <p
            role="status"
            className="mb-6 rounded-xl border border-[#f0d2d9] bg-white px-4 py-3 text-sm text-[#a34d68]"
          >
            {message}
          </p>
        )}

        {/* {activity === "menu" && (
          <>
            <section className="mb-10">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#f1dce2] bg-white px-4 py-2 text-xs tracking-wide text-[#ad7187]">
                <Heart size={13} />
                NOTRE PETIT UNIVERS
              </span>
              <h1 className="mt-5 text-4xl font-medium tracking-tight sm:text-5xl">
                On joue à quoi,
                <br />
                <span className="font-serif italic text-[#cc819a]">
                  aujourd&apos;hui ?
                </span>
              </h1>
              <p className="mt-4 max-w-lg leading-7 text-[#907b82]">
                Des jeux, des confidences et des petits défis pour se retrouver,
                même à distance.
              </p>
            </section>

            <div className="grid gap-5 sm:grid-cols-2">
              <button
                onClick={() => setActivity("morpion")}
                className="rounded-3xl border border-[#f0dfe3] bg-white p-6 text-left transition hover:-translate-y-1 hover:shadow-lg"
              >
                <Gamepad2 className="text-[#c98298]" size={25} />
                <h2 className="mt-5 text-xl font-medium">Morpion</h2>
                <p className="mt-2 text-sm leading-6 text-[#907b82]">
                  Une petite compétition, juste vous deux.
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm text-[#b8768d]">
                  Jouer <ChevronRight size={16} />
                </span>
              </button>
              
<button
  onClick={() => setActivity("dames")}
  className="rounded-3xl border border-[#f0dfe3] bg-white p-6 text-left transition hover:-translate-y-1 hover:shadow-lg"
>
  <Gamepad2 className="text-[#9e91c7]" size={25} />
  <h2 className="mt-5 text-xl font-medium">Jeu de dames</h2>
  <p className="mt-2 text-sm leading-6 text-[#907b82]">
    Déplace tes pions, capture ceux de ton partenaire et deviens la reine du plateau.
  </p>
  <span className="mt-5 inline-flex items-center gap-2 text-sm text-[#b8768d]">
    Jouer <ChevronRight size={16} />
  </span>
</button>


<button
  onClick={() => setActivity("puzzle")}
  className="rounded-3xl border border-[#f0dfe3] bg-white p-6 text-left transition hover:-translate-y-1 hover:shadow-lg"
>
  <Gamepad2 className="text-[#9e91c7]" size={25} />
  <h2 className="mt-5 text-xl font-medium">Puzzle à deux</h2>
  <p className="mt-2 text-sm leading-6 text-[#907b82]">
    Assemblez la même image ensemble, chacun sur son téléphone.
  </p>
  <span className="mt-5 inline-flex items-center gap-2 text-sm text-[#b8768d]">
    Jouer <ChevronRight size={16} />
  </span>
</button>

<button 
  onClick={() => setActivity("forinarow")}
  className="rounded-3xl border border-[#f0dfe3] bg-white p-6 text-left transition hover:-translate-y-1 hover:shadow-lg"
>
  <Gamepad2 className="text-[#9e91c7]" size={25} />
  <h2 className="mt-5 text-xl font-medium">Puissance 4</h2>
  <p className="mt-2 text-sm leading-6 text-[#907b82]">
    Alignez quatre jetons avant votre partenaire
    dans ce duel stratégique à deux.
  </p>
  <span className="mt-5 inline-flex items-center gap-2 text-sm text-[#b8768d]">
    Jouer <ChevronRight size={16} />
  </span>
</button>


<button
  onClick={() => setActivity("linked")}
  className="rounded-3xl border border-[#f0dfe3] bg-white p-6 text-left transition hover:-translate-y-1 hover:shadow-lg"
>
  <Heart className="text-[#c98298]" size={25} />
  <h2 className="mt-5 text-xl font-medium">
    Liés pour avancer
  </h2>
  <p className="mt-2 text-sm leading-6 text-[#907b82]">
    Deux personnages, cinq niveaux et une seule mission :
    franchir tous les obstacles ensemble. Si l&apos;un tombe,
    vous recommencez à deux.
  </p>
  <span className="mt-5 inline-flex items-center gap-2 text-sm text-[#b8768d]">
    Jouer <ChevronRight size={16} />
  </span>
</button>


<button
  onClick={() => setActivity("ludo")}
  className="rounded-3xl border border-[#f0dfe3] bg-white p-6 text-left transition hover:-translate-y-1 hover:shadow-lg"
>
  <Gamepad2 className="text-[#c98298]" size={25} />
  <h2 className="mt-5 text-xl font-medium">
    Ludo
  </h2>
  <p className="mt-2 text-sm leading-6 text-[#907b82]">
    Lance le dé, avance tes pions et défie ton partenaire.
    Une partie multijoueur pour jouer ensemble, même à distance.
  </p>
  <span className="mt-5 inline-flex items-center gap-2 text-sm text-[#b8768d]">
    Jouer <ChevronRight size={16} />
  </span>
</button>


             
<Link
  href="/games/defis"
  className="rounded-3xl border border-[#f0dfe3] bg-white p-6 text-left transition hover:-translate-y-1 hover:shadow-lg"
>
  <Sparkles className="text-[#9e91c7]" size={25} />
  <h2 className="mt-5 text-xl font-medium">Nos défis</h2>
  <p className="mt-2 text-sm leading-6 text-[#907b82]">
    Des missions romantiques, des confidences et vos propres idées.
  </p>
  <span className="mt-5 inline-flex items-center gap-2 text-sm text-[#b8768d]">
    Découvrir <ChevronRight size={16} />
  </span>
</Link>


             <Link
  href="/games/questions"
  className="rounded-3xl border border-[#f0dfe3] bg-white p-6 text-left transition hover:-translate-y-1 hover:shadow-lg sm:col-span-2"
>
  <MessageCircleHeart className="text-[#c28e58]" size={25} />
  <h2 className="mt-5 text-xl font-medium">Questions express</h2>
  <p className="mt-2 text-sm leading-6 text-[#907b82]">
    Choisissez vos réponses et comparez vos points de vue.
  </p>
  <span className="mt-5 inline-flex items-center gap-2 text-sm text-[#b8768d]">
    Commencer <ChevronRight size={16} />
  </span>
</Link>
            </div>
          </>
        )} */}

        {activity === "menu" && (
  <>
    <section className="mb-10">
      <span className="inline-flex items-center gap-2 rounded-full border border-[#f1dce2] bg-white px-4 py-2 text-xs tracking-wide text-[#ad7187]">
        <Heart size={13} />
        NOTRE PETIT UNIVERS
      </span>
      <h1 className="mt-5 text-4xl font-medium tracking-tight sm:text-5xl">
        On joue à quoi,
        <br />
        <span className="font-serif italic text-[#cc819a]">
          aujourd&apos;hui ?
        </span>
      </h1>
      <p className="mt-4 max-w-lg leading-7 text-[#907b82]">
        Des jeux, des confidences et des petits défis pour se retrouver,
        même à distance.
      </p>
    </section>

    <div className="grid grid-cols-2 gap-4 sm:gap-5">
      {games.map((game) => (
        <button
          key={game.key}
          onClick={() => setOpenedGame(game)}
          className="group overflow-hidden rounded-3xl border border-[#f0dfe3] bg-white text-left transition hover:-translate-y-1 hover:shadow-lg"
        >
          {/* Zone image / illustration */}
         <div className="relative aspect-square overflow-hidden">
  <img
    src={`/games/${game.key}.png`}
    alt={game.title}
    className="h-full w-full object-cover transition group-hover:scale-105"
  />
</div>

          {/* Texte sous l'image */}
          <div className="p-4 sm:p-5">
            <h2 className="text-base font-medium sm:text-lg">
              {game.title}
            </h2>
            <p className="mt-1 text-xs leading-5 text-[#907b82] sm:text-sm">
              {game.short}
            </p>
          </div>
        </button>
      ))}
    </div>

    {/* Modale de description */}
    {openedGame && (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-[#49353d]/30 p-4 backdrop-blur-sm sm:items-center"
        onClick={() => setOpenedGame(null)}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          className="w-full max-w-md rounded-3xl border border-[#f0dfe3] bg-white p-6 shadow-[0_24px_80px_rgba(125,76,91,0.18)] sm:p-8"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fff0f4] to-[#f8f0ff] text-[#c98298]">
              {openedGame.icon}
            </div>
            <button
              onClick={() => setOpenedGame(null)}
              className="rounded-full p-2 text-[#a78b93] transition hover:bg-[#fff0f4]"
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>

          <h2 className="mt-5 text-2xl font-medium">{openedGame.title}</h2>
          <p className="mt-3 text-sm leading-6 text-[#907b82]">
            {openedGame.description}
          </p>

          {openedGame.href ? (
            <Link
              href={openedGame.href}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#b87188]"
            >
              Découvrir <ChevronRight size={16} />
            </Link>
          ) : (
            <button
              onClick={() => {
                setActivity(openedGame.key);
                setOpenedGame(null);
              }}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#b87188]"
            >
              Jouer <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    )}
  </>
)}

        {activity === "defis" && !session && (
          <>
            <button
              onClick={() => setActivity("menu")}
              className="mb-6 text-sm text-[#977781] hover:text-[#49353d]"
            >
              ← Tous les jeux
            </button>

            <h1 className="text-3xl font-medium">Nos défis</h1>
            <p className="mt-2 text-sm leading-6 text-[#907b82]">
              Choisissez un défi, créez une salle et partagez le code avec votre
              partenaire.
            </p>

            <div className="mt-6 rounded-3xl border border-[#f0dfe3] bg-white p-5">
              <h2 className="font-medium">Rejoindre avec un code</h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void joinSession();
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  value={roomInput}
                  onChange={(event) =>
                    setRoomInput(event.target.value.toUpperCase())
                  }
                  maxLength={6}
                  placeholder="CODE"
                  className="min-w-0 flex-1 rounded-full border border-[#eedde1] bg-[#fffafa] px-4 py-3 text-sm uppercase outline-none focus:border-[#c98298]"
                />
                <button
                  disabled={busy}
                  className="rounded-full bg-[#c98298] px-5 py-3 text-sm text-white disabled:opacity-60"
                >
                  Rejoindre
                </button>
              </form>
            </div>

            <div className="mt-8 flex items-center justify-between gap-3">
              <h2 className="text-xl font-medium">Choisir un défi</h2>
              <button
                onClick={() => setShowCreator((value) => !value)}
                className="rounded-full border border-[#e9d1d8] px-4 py-2.5 text-sm text-[#ad7187] hover:bg-[#fff2f5]"
              >
                {showCreator ? "Fermer" : "+ Créer le mien"}
              </button>
            </div>

            {showCreator && (
              <form
                onSubmit={(event) => void createCustomChallenge(event)}
                className="mt-4 space-y-4 rounded-3xl border border-[#f0dfe3] bg-white p-5"
              >
                <h3 className="font-medium">Notre défi personnalisé</h3>
                <input
                  required
                  maxLength={120}
                  value={customTitle}
                  onChange={(event) => setCustomTitle(event.target.value)}
                  placeholder="Titre du défi"
                  className="w-full rounded-xl border border-[#eedde1] bg-[#fffafa] px-4 py-3 text-sm outline-none focus:border-[#c98298]"
                />
                <textarea
                  required
                  maxLength={1000}
                  rows={3}
                  value={customDescription}
                  onChange={(event) => setCustomDescription(event.target.value)}
                  placeholder="Expliquez ce qu'il faut faire ou répondre…"
                  className="w-full rounded-xl border border-[#eedde1] bg-[#fffafa] px-4 py-3 text-sm outline-none focus:border-[#c98298]"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    value={customCategory}
                    onChange={(event) => setCustomCategory(event.target.value)}
                    className="rounded-xl border border-[#eedde1] bg-white px-4 py-3 text-sm"
                  >
                    <option>Complicité</option>
                    <option>Romantique</option>
                    <option>Action</option>
                    <option>Découverte</option>
                  </select>
                  <select
                    value={customKind}
                    onChange={(event) =>
                      setCustomKind(event.target.value as "question" | "action")
                    }
                    className="rounded-xl border border-[#eedde1] bg-white px-4 py-3 text-sm"
                  >
                    <option value="action">Action à réaliser</option>
                    <option value="question">Question à répondre</option>
                  </select>
                </div>
                <button
                  disabled={busy}
                  className="rounded-full bg-[#c98298] px-5 py-3 text-sm text-white disabled:opacity-60"
                >
                  {busy ? "Enregistrement…" : "Enregistrer le défi"}
                </button>
              </form>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {challenges.map((challenge) => (
                <article
                  key={challenge.id}
                  className="rounded-3xl border border-[#f0dfe3] bg-white p-5"
                >
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-[#fff0f4] px-3 py-1.5 text-[#ad7187]">
                      {challenge.category}
                    </span>
                    {challenge.is_daily && (
                      <span className="rounded-full bg-[#f8f0ff] px-3 py-1.5 text-[#897bb6]">
                        Défi du jour
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 font-medium">{challenge.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#907b82]">
                    {challenge.description}
                  </p>
                  <button
                    onClick={() => void createSession(challenge)}
                    disabled={busy}
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#c98298] px-4 py-2.5 text-sm text-white disabled:opacity-60"
                  >
                    Lancer ce défi <ChevronRight size={15} />
                  </button>
                </article>
              ))}
            </div>

            {challenges.length === 0 && (
              <p className="mt-6 rounded-2xl bg-white p-5 text-sm text-[#907b82]">
                Aucun défi disponible pour le moment. Vérifie que les quatre
                défis prédéfinis ont bien été insérés dans Supabase.
              </p>
            )}
          </>
        )}

{(activity === "defis" ) &&
  session &&
  selectedChallenge && (
              <section className="mx-auto max-w-2xl">
            <button
              onClick={leaveSession}
              className="mb-6 text-sm text-[#977781] hover:text-[#49353d]"
            >
              ← Retour aux jeux
            </button>

            <div className="rounded-3xl border border-[#f0dfe3] bg-white p-6 shadow-[0_18px_60px_rgba(125,76,91,0.05)] sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs tracking-widest text-[#b28a97]">
                    {selectedChallenge.category.toUpperCase()}
                  </p>
                  <h1 className="mt-3 text-3xl font-medium">
                    {selectedChallenge.title}
                  </h1>
                </div>
                <Heart className="shrink-0 text-[#c98298]" size={25} />
              </div>

              <p className="mt-4 leading-7 text-[#907b82]">
                {selectedChallenge.description}
              </p>

              <div className="mt-6 rounded-2xl bg-[#fff9f7] p-4">
                <p className="text-xs tracking-wide text-[#a78b93]">
                  CODE DE VOTRE SALLE
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-2xl font-semibold tracking-[0.2em]">
                    {session.room_code}
                  </span>
                  <button
                    onClick={() => void copyCode()}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm text-[#ad7187]"
                  >
                    <Copy size={14} />
                    {copied ? "Copié !" : "Copier"}
                  </button>
                </div>
                <p className="mt-3 flex items-center gap-2 text-sm text-[#907b82]">
                  <Users size={16} />
                  {session.guest_id
                    ? "Vous êtes deux dans la salle."
                    : "En attente de ton partenaire. Envoie-lui le code."}
                </p>
              </div>

              {session.status === "playing" && (
                <>
                  <form onSubmit={(event) => void submitResponse(event)}>
                    <label className="mt-7 block text-sm font-medium">
                      {myResponse
                        ? "Modifie ta réponse si tu le souhaites"
                        : "Ta réponse"}
                    </label>
                    <textarea
                      required
                      maxLength={5000}
                      rows={5}
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      placeholder="Écris ici ta réponse ou raconte comment tu as réalisé le défi…"
                      className="mt-3 w-full rounded-2xl border border-[#eedde1] bg-[#fffafa] p-4 text-sm leading-6 outline-none focus:border-[#c98298]"
                    />
                    <label className="mt-4 block text-sm font-medium">
                      Lien vers une photo (facultatif)
                    </label>
                    <input
                      type="url"
                      value={proofUrl}
                      onChange={(event) => setProofUrl(event.target.value)}
                      placeholder="https://…"
                      className="mt-2 w-full rounded-xl border border-[#eedde1] bg-[#fffafa] px-4 py-3 text-sm outline-none focus:border-[#c98298]"
                    />
                    <button
                      disabled={busy || !answer.trim()}
                      className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-[#c98298] px-6 py-3.5 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {busy ? (
                        <LoaderCircle size={16} className="animate-spin" />
                      ) : (
                        <Check size={16} />
                      )}
                      {myResponse ? "Mettre à jour ma réponse" : "Envoyer ma réponse"}
                    </button>
                  </form>

                  <div className="mt-8 border-t border-[#f3e8ea] pt-6">
                    <h2 className="font-medium">Vos réponses</h2>
                    {!bothAnswered ? (
                      <p className="mt-2 text-sm leading-6 text-[#907b82]">
                        {myResponse
                          ? "Ta réponse est enregistrée. Elle restera privée jusqu'à ce que ton partenaire ait répondu lui aussi."
                          : "Répondez chacun de votre côté. Vos réponses seront dévoilées lorsque vous aurez tous les deux participé."}
                      </p>
                    ) : (
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {[myResponse, partnerResponse].map((row, index) =>
                          row ? (
                            <div
                              key={row.id}
                              className="rounded-2xl bg-[#fff9f7] p-4"
                            >
                              <p className="text-xs text-[#ad7187]">
                                {row.user_id === userId ? "Ta réponse" : "Réponse de ton partenaire"}
                              </p>
                              <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                                {row.answer}
                              </p>
                              {row.proof_url && (
                                <a
                                  href={row.proof_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-3 inline-block text-sm text-[#ad7187] underline"
                                >
                                  Voir la photo
                                </a>
                              )}
                            </div>
                          ) : null
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        )}

       



        <footer className="mt-12 flex items-center justify-center gap-2 text-xs text-[#b29aa1]">
          <Heart size={12} />
          Un petit monde, rien qu&apos;à nous · Oycea
        </footer>
      </div>
    </main>
  );
}
