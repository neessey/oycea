
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Copy,
  Dices,
  Heart,
  LoaderCircle,
  RotateCcw,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Player = "host" | "guest";
type GameStatus = "waiting" | "playing" | "finished";

type LudoState = {
  tokens: { host: number[]; guest: number[] };
  turn: Player;
  dice: number | null;
  message: string;
  winner: Player | null;
};

type LudoSession = {
  id: string;
  room_code: string;
  host_id: string;
  guest_id: string | null;
  status: GameStatus;
  game_state: LudoState;
};

const STORAGE_KEY = "oycea_ludo_session_id";
const COLORS: Record<Player, string> = {
  host: "#d86d91",
  guest: "#8170c8",
};

// Position initiale des deux joueurs sur le parcours de 52 cases.
const START: Record<Player, number> = { host: 0, guest: 26 };
const SAFE_CELLS = [0, 8, 13, 21, 26, 34, 39, 47];

// Coordonnées du parcours circulaire.
const PATH = Array.from({ length: 52 }, (_, i) => {
  const angle = (-Math.PI / 2) + (i / 52) * Math.PI * 2;
  return {
    x: 200 + Math.cos(angle) * 125,
    y: 200 + Math.sin(angle) * 125,
  };
});

export default function LudoGame({ onBack }: { onBack: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [session, setSession] = useState<LudoSession | null>(null);
  const [roomInput, setRoomInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedToken, setSelectedToken] = useState<number | null>(null);

  const refreshSession = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("oycea_ludo_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!error && data) {
      setSession(data as LudoSession);
      setSelectedToken(null);
    }
  }, [supabase]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        window.location.href = "/login";
        return;
      }

      if (!active) return;
      setUserId(data.user.id);

      const savedId = sessionStorage.getItem(STORAGE_KEY);
      if (savedId) {
        const { data: saved } = await supabase
          .from("oycea_ludo_sessions")
          .select("*")
          .eq("id", savedId)
          .maybeSingle();

        if (
          active &&
          saved &&
          (saved.host_id === data.user.id ||
            saved.guest_id === data.user.id)
        ) {
          setSession(saved as LudoSession);
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
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
      .channel(`oycea-ludo-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "oycea_ludo_sessions",
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
      const { data, error } = await supabase.rpc("oycea_ludo_create_game");
      if (error) throw error;

      const created = data as LudoSession;
      sessionStorage.setItem(STORAGE_KEY, created.id);
      setSession(created);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Création de salle impossible."
      );
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    if (roomInput.trim().length !== 6 || busy) return;
    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc("oycea_ludo_join_game", {
        p_room_code: roomInput.trim().toUpperCase(),
      });
      if (error) throw error;

      const joined = data as LudoSession;
      sessionStorage.setItem(STORAGE_KEY, joined.id);
      setSession(joined);
      setRoomInput("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Impossible de rejoindre la salle."
      );
    } finally {
      setBusy(false);
    }
  }

  async function performAction(
    action: "roll" | "move",
    tokenIndex: number | null = null
  ) {
    if (!session || busy) return;
    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc("oycea_ludo_action", {
        p_room_code: session.room_code,
        p_action: action,
        p_token_index: tokenIndex,
      });

      if (error) throw error;

      setSession(data as LudoSession);
      setSelectedToken(null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Action impossible."
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
    sessionStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setSelectedToken(null);
    setMessage("");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fff9f7]">
        <LoaderCircle className="animate-spin text-[#c98298]" size={28} />
      </main>
    );
  }

  const isHost = session?.host_id === userId;
  const myPlayer: Player = isHost ? "host" : "guest";
  const state = session?.game_state;
  const myTurn = Boolean(
    session?.status === "playing" && state?.turn === myPlayer
  );
  const tokens = state?.tokens;
  const myTokens = tokens?.[myPlayer] ?? [];
  const otherPlayer: Player = myPlayer === "host" ? "guest" : "host";
  const dice = state?.dice;

  const canMove = (index: number) => {
    if (!myTurn || dice === null || dice === undefined) return false;
    const progress = myTokens[index];
    if (progress === 56) return false;
    if (progress === -1) return dice === 6;
    return progress + dice <= 56;
  };

  function tokenCoordinates(player: Player, progress: number) {
    if (progress === -1) return null;
    if (progress === 56) return { x: 200, y: 200 };

    // Parcours extérieur : 51 cases, puis couloir final vers le centre.
    if (progress <= 50) {
      return PATH[(START[player] + progress) % 52];
    }

    const entry = PATH[(START[player] + 51) % 52];
    const step = progress - 50;
    return {
      x: entry.x + (200 - entry.x) * (step / 6),
      y: entry.y + (200 - entry.y) * (step / 6),
    };
  }

  const homeSlots: Record<Player, { x: number; y: number }[]> = {
    host: [
      { x: 52, y: 52 },
      { x: 78, y: 52 },
      { x: 52, y: 78 },
      { x: 78, y: 78 },
    ],
    guest: [
      { x: 322, y: 322 },
      { x: 348, y: 322 },
      { x: 322, y: 348 },
      { x: 348, y: 348 },
    ],
  };

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
              OYCEA · JEU À DEUX
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Ludo en amoureux
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#907b82]">
            Lance le dé, sors tes pions avec un 6, avance sur le parcours et
            capture les pions adverses. Le premier à ramener ses quatre pions
            au centre gagne.
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
              <h2 className="mt-4 text-xl font-medium">Créer une salle</h2>
              <p className="mt-2 text-sm leading-6 text-[#907b82]">
                Crée ta partie et envoie le code à ton partenaire.
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
              <Users size={25} className="text-[#8170c8]" />
              <h2 className="mt-4 text-xl font-medium">Rejoindre une salle</h2>
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
                  disabled={busy || roomInput.trim().length !== 6}
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
                    ? "Partie terminée."
                    : state?.turn === myPlayer
                      ? "C'est ton tour !"
                      : "C'est au tour de ton partenaire."}
              </p>
            </section>

            {session.status === "waiting" ? (
              <section className="rounded-3xl border border-[#f0dfe3] bg-white p-8 text-center">
                <div className="text-5xl">🎲 💗 🎲</div>
                <h2 className="mt-5 text-xl font-medium">La partie va bientôt commencer</h2>
                <p className="mt-2 text-sm leading-6 text-[#907b82]">
                  Ouvre Oycea sur un autre appareil et rejoins avec le code.
                </p>
              </section>
            ) : (
              <>
                <section className="rounded-3xl border border-[#f0dfe3] bg-white p-3 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="h-3 w-3 rounded-full" style={{ background: COLORS.host }} />
                      <span>Rose : {state?.tokens.host.filter((n) => n === 56).length}/4</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="h-3 w-3 rounded-full" style={{ background: COLORS.guest }} />
                      <span>Violet : {state?.tokens.guest.filter((n) => n === 56).length}/4</span>
                    </div>
                  </div>

                  <div className="mx-auto max-w-[440px]">
                    <svg viewBox="0 0 400 400" className="h-auto w-full rounded-3xl bg-[#fff9f7]" role="img" aria-label="Plateau de Ludo">
                      <rect x="18" y="18" width="102" height="102" rx="18" fill="#f9dce5" />
                      <rect x="280" y="280" width="102" height="102" rx="18" fill="#e5dffa" />

                      {PATH.map((point, index) => (
                        <g key={index}>
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r="9"
                            fill={SAFE_CELLS.includes(index) ? "#f5d88b" : "#ffffff"}
                            stroke="#e9d8df"
                            strokeWidth="1.5"
                          />
                          {SAFE_CELLS.includes(index) && (
                            <text x={point.x} y={point.y + 3} textAnchor="middle" fontSize="9" fill="#9d7d42">★</text>
                          )}
                        </g>
                      ))}

                      {(["host", "guest"] as Player[]).map((player) =>
                        state?.tokens[player].map((progress, index) => {
                          const position = tokenCoordinates(player, progress);
                          const home = progress === -1 ? homeSlots[player][index] : null;
                          const point = position ?? home!;
                          const selectable =
                            player === myPlayer &&
                            canMove(index) &&
                            session.status === "playing";

                          return (
                            <g
                              key={`${player}-${index}`}
                              onClick={() => {
                                if (selectable) setSelectedToken(index);
                              }}
                              style={{ cursor: selectable ? "pointer" : "default" }}
                            >
                              {selectedToken === index && player === myPlayer && (
                                <circle cx={point.x} cy={point.y} r="16" fill="none" stroke="#49353d" strokeWidth="2" strokeDasharray="3 3" />
                              )}
                              <circle
                                cx={point.x}
                                cy={point.y}
                                r={progress === 56 ? 10 : 8}
                                fill={COLORS[player]}
                                stroke={selectable ? "#49353d" : "#ffffff"}
                                strokeWidth={selectable ? 3 : 2}
                              />
                              <text
                                x={point.x}
                                y={point.y + 3}
                                textAnchor="middle"
                                fontSize="8"
                                fontWeight="bold"
                                fill="white"
                              >
                                {index + 1}
                              </text>
                            </g>
                          );
                        })
                      )}

                      <circle cx="200" cy="200" r="24" fill="#fff0f4" stroke="#e9cbd5" strokeWidth="2" />
                      <text x="200" y="207" textAnchor="middle" fontSize="23">❤️</text>
                      <text x="69" y="35" textAnchor="middle" fontSize="10" fill="#9b4f6a">ROSE</text>
                      <text x="331" y="365" textAnchor="middle" fontSize="10" fill="#6655a5">VIOLET</text>
                    </svg>
                  </div>

                  <div className="mt-5 rounded-2xl bg-[#fff9f7] p-4 text-center">
                    <div className="text-sm text-[#907b82]">
                      {state?.message}
                    </div>

                    {session.status === "playing" && (
                      <>
                        <div className="my-4 flex items-center justify-center gap-3">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#f0dfe3] bg-white text-2xl font-bold">
                            {dice ?? "–"}
                          </div>
                          {myTurn && dice === null && (
                            <button
                              onClick={() => void performAction("roll")}
                              disabled={busy}
                              className="inline-flex items-center gap-2 rounded-full bg-[#c98298] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
                            >
                              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Dices size={17} />}
                              Lancer le dé
                            </button>
                          )}
                        </div>

                        {myTurn && dice !== null && dice !== undefined && (
                          <div>
                            <p className="mb-3 text-sm font-medium">
                              Choisis un pion à déplacer
                            </p>
                            <div className="flex flex-wrap justify-center gap-2">
                              {myTokens.map((progress, index) => (
                                <button
                                  key={index}
                                  disabled={!canMove(index) || busy}
                                  onClick={() => {
                                    setSelectedToken(index);
                                    void performAction("move", index);
                                  }}
                                  className="rounded-xl border px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-35"
                                  style={{
                                    borderColor: selectedToken === index ? COLORS[myPlayer] : "#eedde1",
                                    background: selectedToken === index ? "#fff0f4" : "white",
                                  }}
                                >
                                  Pion {index + 1}
                                  <span className="ml-2 text-xs">
                                    {progress === -1 ? "🏠" : progress === 56 ? "🏆" : `${progress}/56`}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {!myTurn && (
                          <p className="text-xs text-[#a78b93]">
                            Attends le lancer de ton partenaire.
                          </p>
                        )}
                      </>
                    )}

                    {session.status === "finished" && (
                      <button
                        onClick={leaveRoom}
                        className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#c98298] px-5 py-3 text-sm text-white"
                      >
                        <RotateCcw size={16} /> Nouvelle partie
                      </button>
                    )}
                  </div>
                </section>
                <p className="mt-4 text-center text-xs leading-5 text-[#a78b93]">
                  Un 6 permet de sortir un pion de la maison. Les étoiles
                  indiquent des cases protégées. Les mouvements sont validés
                  par Supabase pour les deux joueurs.
                </p>
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
