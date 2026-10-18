
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Heart,
  LoaderCircle,
  Copy,
  Users,
  Footprints,
  RotateCcw,
  Trophy,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type PlayerState = { x: number };
type GameState = {
  level: number;
  players: { host: PlayerState; guest: PlayerState };
  message?: string;
};

type LinkedSession = {
  id: string;
  room_code: string;
  host_id: string;
  guest_id: string | null;
  status: "waiting" | "playing" | "finished";
  game_state: GameState;
};

const SESSION_KEY = "oycea_linked_adventure_session";

const LEVELS = [
  { gaps: [3], hazards: [7] },
  { gaps: [2, 6], hazards: [4, 9] },
  { gaps: [3, 7], hazards: [5, 9] },
  { gaps: [2, 5, 8], hazards: [6] },
  { gaps: [3, 6, 9], hazards: [4, 8] },
];

const initialState: GameState = {
  level: 1,
  players: { host: { x: 0 }, guest: { x: 0 } },
  message: "Avancez ensemble jusqu'au cœur.",
};

export default function LinkedAdventureGame({
  onBack,
}: {
  onBack: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [session, setSession] = useState<LinkedSession | null>(null);
  const [roomInput, setRoomInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const refreshSession = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("oycea_linked_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) return;
    setSession(data as LinkedSession);
  }, [supabase]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        window.location.href = "/login";
        return;
      }

      if (!active) return;
      setUserId(data.user.id);

      const savedId = sessionStorage.getItem(SESSION_KEY);
      if (savedId) {
        const { data: saved } = await supabase
          .from("oycea_linked_sessions")
          .select("*")
          .eq("id", savedId)
          .maybeSingle();

        if (
          active &&
          saved &&
          (saved.host_id === data.user.id ||
            saved.guest_id === data.user.id)
        ) {
          setSession(saved as LinkedSession);
        } else {
          sessionStorage.removeItem(SESSION_KEY);
        }
      }

      if (active) setLoading(false);
    }

    void initialize();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!session?.id) return;

    const channel = supabase
      .channel(`oycea-linked-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "oycea_linked_sessions",
          filter: `id=eq.${session.id}`,
        },
        () => void refreshSession(session.id)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.id, supabase, refreshSession]);

  async function createRoom() {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "oycea_linked_create_game"
      );

      if (error) throw error;

      const created = data as LinkedSession;
      sessionStorage.setItem(SESSION_KEY, created.id);
      setSession(created);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Impossible de créer la salle."
      );
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    if (!roomInput.trim() || busy) return;
    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "oycea_linked_join_game",
        { p_room_code: roomInput.trim().toUpperCase() }
      );

      if (error) throw error;

      const joined = data as LinkedSession;
      sessionStorage.setItem(SESSION_KEY, joined.id);
      setSession(joined);
      setRoomInput("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Impossible de rejoindre cette salle."
      );
    } finally {
      setBusy(false);
    }
  }

  async function act(action: "left" | "right" | "jump") {
    if (!session || session.status !== "playing" || busy) return;
    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "oycea_linked_move",
        {
          p_room_code: session.room_code,
          p_action: action,
        }
      );

      if (error) throw error;
      setSession(data as LinkedSession);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Le déplacement n'a pas fonctionné."
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!session) return;

    try {
      await navigator.clipboard.writeText(session.room_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage("Copie impossible. Note le code affiché.");
    }
  }

  function leaveRoom() {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
    setMessage("");
  }

  useEffect(() => {
    if (!session || session.status !== "playing") return;

    function onKeyDown(event: KeyboardEvent) {
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(event.key)
      ) {
        event.preventDefault();
      }

      if (event.repeat) return;
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        void act("left");
      } else if (
        event.key === "ArrowRight" ||
        event.key.toLowerCase() === "d"
      ) {
        void act("right");
      } else if (
        event.key === "ArrowUp" ||
        event.key === " " ||
        event.key.toLowerCase() === "w"
      ) {
        void act("jump");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [session, busy]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fff9f7]">
        <LoaderCircle className="animate-spin text-[#c98298]" size={28} />
      </main>
    );
  }

  const isHost = session?.host_id === userId;
  const myPlayer = isHost ? "host" : "guest";
  const state = session?.game_state ?? initialState;
  const level = LEVELS[Math.min(state.level - 1, LEVELS.length - 1)];
  const hostX = state.players.host.x;
  const guestX = state.players.guest.x;

  return (
    <main className="min-h-screen bg-[#fff9f7] px-4 py-6 text-[#49353d] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <button
          onClick={session ? leaveRoom : onBack}
          className="mb-6 inline-flex items-center gap-2 text-sm text-[#977781]"
        >
          <ArrowLeft size={17} /> Retour aux jeux
        </button>

        <header className="mb-7">
          <div className="flex items-center gap-2 text-[#c98298]">
            <Heart size={20} />
            <span className="text-xs font-semibold tracking-[0.2em]">
              OYCEA · AVENTURE À DEUX
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Liés pour avancer
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#907b82]">
            Deux personnages, un seul objectif. Avancez, sautez les trous
            et atteignez le cœur ensemble. Si l&apos;un tombe, vous recommencez.
          </p>
        </header>

        {message && (
          <p role="status" className="mb-5 rounded-xl bg-white p-3 text-sm text-[#a34d68]">
            {message}
          </p>
        )}

        {!session ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <section className="rounded-3xl border border-[#f0dfe3] bg-white p-6">
              <Heart size={25} className="text-[#c98298]" />
              <h2 className="mt-4 text-xl font-medium">Créer une aventure</h2>
              <p className="mt-2 text-sm leading-6 text-[#907b82]">
                Crée ta salle puis envoie le code à ton partenaire.
              </p>
              <button
                onClick={() => void createRoom()}
                disabled={busy}
                className="mt-5 w-full rounded-full bg-[#c98298] px-5 py-3 text-sm text-white disabled:opacity-60"
              >
                {busy ? "Création…" : "Créer ma salle"}
              </button>
            </section>

            <section className="rounded-3xl border border-[#f0dfe3] bg-white p-6">
              <Users size={25} className="text-[#9e91c7]" />
              <h2 className="mt-4 text-xl font-medium">Rejoindre une salle</h2>
              <p className="mt-2 text-sm leading-6 text-[#907b82]">
                Entre le code que ton partenaire t&apos;a envoyé.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void joinRoom();
                }}
                className="mt-5 space-y-3"
              >
                <input
                  value={roomInput}
                  onChange={(event) =>
                    setRoomInput(event.target.value.toUpperCase())
                  }
                  maxLength={6}
                  placeholder="CODE À 6 LETTRES"
                  className="w-full rounded-full border border-[#eedde1] bg-[#fffafa] px-4 py-3 text-center uppercase tracking-[0.2em] outline-none focus:border-[#c98298]"
                />
                <button
                  disabled={busy || roomInput.trim().length < 6}
                  className="w-full rounded-full border border-[#e9d1d8] px-5 py-3 text-sm text-[#ad7187] disabled:opacity-50"
                >
                  Rejoindre
                </button>
              </form>
            </section>
          </div>
        ) : (
          <>
            <section className="mb-5 rounded-2xl border border-[#f0dfe3] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-[#a78b93]">CODE DE LA SALLE</p>
                  <p className="mt-1 text-2xl font-bold tracking-[0.2em]">
                    {session.room_code}
                  </p>
                </div>
                <button
                  onClick={() => void copyCode()}
                  className="inline-flex items-center gap-2 rounded-full bg-[#fff2f5] px-4 py-2 text-sm text-[#ad7187]"
                >
                  <Copy size={15} /> {copied ? "Copié !" : "Copier le code"}
                </button>
              </div>
              <p className="mt-3 flex items-center gap-2 text-sm text-[#907b82]">
                <Users size={16} />
                {session.status === "waiting"
                  ? "En attente du deuxième joueur…"
                  : session.status === "finished"
                    ? "Vous avez terminé l'aventure !"
                    : `Tu contrôles le personnage ${myPlayer === "host" ? "rose" : "violet"}.`}
              </p>
            </section>

            {session.status === "waiting" && (
              <div className="rounded-3xl border border-[#f0dfe3] bg-white p-8 text-center">
                <h2 className="mt-5 text-xl font-medium">
                  Votre aventure vous attend
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#907b82]">
                  Le jeu démarrera dès que ton partenaire aura rejoint la salle grâce au code.
                </p>
              </div>
            )}

            {session.status !== "waiting" && (
              <>
                <section className="overflow-hidden rounded-3xl border border-[#f0dfe3] bg-white p-4 sm:p-6">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs tracking-widest text-[#b28a97]">
                        NIVEAU {Math.min(state.level, LEVELS.length)}
                      </p>
                      <h2 className="mt-1 text-lg font-medium">
                        {session.status === "finished"
                          ? "Vous l'avez fait, ensemble !"
                          : "Le sentier des cœurs"}
                      </h2>
                    </div>
                    {session.status === "finished" ? (
                      <Trophy className="text-[#c98298]" size={25} />
                    ) : (
                      <Heart className="text-[#c98298]" size={25} />
                    )}
                  </div>

                  <div className="rounded-2xl bg-gradient-to-b from-[#fff0f5] to-[#f3eefe] p-3 sm:p-5">
                    <div className="grid grid-cols-12 gap-1 sm:gap-2">
                      {Array.from({ length: 12 }, (_, x) => {
                        const gap = level.gaps.includes(x);
                        const hazard = level.hazards.includes(x);
                        const hostHere = hostX === x;
                        const guestHere = guestX === x;
                        const goal = x === 11;

                        return (
                          <div
                            key={x}
                            className="relative flex min-w-0 flex-col items-center"
                          >
                            <div className="flex h-14 w-full items-end justify-center gap-0.5 sm:h-20">
                              {hostHere && (
                                <span className="z-10 text-xl sm:text-3xl" title="Joueur rose">
                                  🩷
                                </span>
                              )}
                              {guestHere && (
                                <span className="z-10 text-xl sm:text-3xl" title="Joueur violet">
                                  💜
                                </span>
                              )}
                              {!hostHere && !guestHere && goal && (
                                <span className="text-xl sm:text-3xl">💖</span>
                              )}
                            </div>
                            <div
                              className={[
                                "h-3 w-full rounded-sm sm:h-4",
                                gap
                                  ? "bg-transparent"
                                  : hazard
                                    ? "bg-[#d58ba2]"
                                    : "bg-[#b7a5d8]",
                              ].join(" ")}
                            />
                            <div className="mt-1 h-4 text-center text-[10px] sm:text-xs">
                              {gap ? "🕳️" : hazard ? "⚠️" : goal ? "🏁" : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-[#907b82]">
                      <span>Départ</span>
                      <span>Arrivée ensemble ❤️</span>
                    </div>
                  </div>

                  <p className="mt-4 rounded-xl bg-[#fff9f7] p-3 text-sm leading-6 text-[#907b82]">
                    {state.message ||
                      "Coordonnez vos mouvements. Un saut permet de franchir une case."}
                  </p>

                  {session.status === "playing" && (
                    <>
                      <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
                        <button
                          disabled={busy}
                          onClick={() => void act("left")}
                          className="rounded-2xl border border-[#eedde1] bg-white px-2 py-4 text-sm font-medium disabled:opacity-50"
                        >
                          ← Gauche
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void act("jump")}
                          className="rounded-2xl bg-[#c98298] px-2 py-4 text-sm font-medium text-white disabled:opacity-50"
                        >
                          ↑ Sauter
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void act("right")}
                          className="rounded-2xl border border-[#eedde1] bg-white px-2 py-4 text-sm font-medium disabled:opacity-50"
                        >
                          Droite →
                        </button>
                      </div>
                      <p className="mt-3 text-center text-xs text-[#a78b93]">
                        Clavier : ← → et espace pour sauter. Sur mobile, utilise
                        les boutons.
                      </p>
                    </>
                  )}

                  {session.status === "finished" && (
                    <button
                      onClick={leaveRoom}
                      className="mt-5 w-full rounded-full bg-[#c98298] px-5 py-3 text-sm text-white"
                    >
                      <RotateCcw size={15} className="mr-2 inline" />
                      Nouvelle aventure
                    </button>
                  )}
                </section>

                <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-[#a78b93]">
                  <span className="inline-flex items-center gap-1">
                    <Footprints size={14} /> Avancez ensemble
                  </span>
                  <span>🕳️ Évitez les trous</span>
                  <span>💗 Arrivez à deux</span>
                </div>
              </>
            )}
          </>
        )}

        <footer className="mt-10 text-center text-xs text-[#b29aa1]">
          <Heart size={12} className="mr-1 inline" />
          Un petit monde, rien qu&apos;à nous · Oycea
        </footer>
      </div>
    </main>
  );
}
