
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Copy,
  LoaderCircle,
  RotateCcw,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Player = "1" | "2" | null;

type GameState = {
  board: Player[];
  turn: "1" | "2";
  winner: "1" | "2" | null;
  draw: boolean;
  moves: number;
};

type GameSession = {
  id: string;
  room_code: string;
  game_type: string;
  host_id: string;
  guest_id: string | null;
  status: "waiting" | "playing" | "finished";
  game_state: GameState;
};

const ROWS = 6;
const COLS = 7;

const EMPTY_STATE: GameState = {
  board: Array(ROWS * COLS).fill(null),
  turn: "1",
  winner: null,
  draw: false,
  moves: 0,
};

export default function FourInARowGame({
  onBack,
}: {
  onBack: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState("");
  const [game, setGame] = useState<GameSession | null>(null);
  const [roomInput, setRoomInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const state = game?.game_state ?? EMPTY_STATE;
  const isHost = game?.host_id === userId;
  const myPlayer: Player = !game
    ? null
    : isHost
      ? "1"
      : "2";

  const canPlay =
    Boolean(game) &&
    game?.status === "playing" &&
    Boolean(myPlayer) &&
    state.turn === myPlayer &&
    !state.winner &&
    !state.draw &&
    !busy;

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

      const savedId = sessionStorage.getItem(
        "oycea_fourinarow_session_id"
      );

      if (savedId) {
        const { data: saved } = await supabase
          .from("oycea_game_sessions")
          .select("*")
          .eq("id", savedId)
          .maybeSingle();

        if (
          active &&
          saved &&
          (saved.host_id === data.user.id ||
            saved.guest_id === data.user.id) &&
          saved.game_type === "fourinarow"
        ) {
          setGame(saved as GameSession);
        } else {
          sessionStorage.removeItem("oycea_fourinarow_session_id");
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
    if (!game?.id) return;

    const channel = supabase
      .channel(`oycea-fourinarow-${game.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "oycea_game_sessions",
          filter: `id=eq.${game.id}`,
        },
        (payload) => {
          if (payload.new && "id" in payload.new) {
            const updated = payload.new as GameSession;

            if (updated.id === game.id) {
              setGame(updated);
            }
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [game?.id, supabase]);

  const createRoom = useCallback(async () => {
    if (busy || !userId) return;

    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "oycea_create_game",
        {
          p_game_type: "fourinarow",
          p_game_state: EMPTY_STATE,
        }
      );

      if (error) {
        setMessage("Création impossible : " + error.message);
        return;
      }

      const created = (Array.isArray(data) ? data[0] : data) as
        | GameSession
        | null;

      if (!created?.id) {
        setMessage("La salle n'a pas pu être créée.");
        return;
      }

      sessionStorage.setItem(
        "oycea_fourinarow_session_id",
        created.id
      );

      setGame(created);
    } finally {
      setBusy(false);
    }
  }, [busy, userId, supabase]);

  const joinRoom = useCallback(async () => {
    const code = roomInput.trim().toUpperCase();

    if (!code || busy) return;

    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "oycea_join_game",
        {
          p_room_code: code,
          p_game_type: "fourinarow",
        }
      );

      if (error) {
        setMessage("Impossible de rejoindre : " + error.message);
        return;
      }

      const joined = (Array.isArray(data) ? data[0] : data) as
        | GameSession
        | null;

      if (!joined?.id) {
        setMessage("Salle introuvable.");
        return;
      }

      sessionStorage.setItem(
        "oycea_fourinarow_session_id",
        joined.id
      );

      setGame(joined);
      setRoomInput("");
    } finally {
      setBusy(false);
    }
  }, [roomInput, busy, supabase]);

  const playColumn = useCallback(
    async (column: number) => {
      if (!game || !canPlay) return;

      const hasSpace = Array.from({ length: ROWS }).some(
        (_, row) => state.board[row * COLS + column] === null
      );

      if (!hasSpace) return;

      setBusy(true);
      setMessage("");

      try {
        const { data, error } = await supabase.rpc(
          "oycea_play_fourinarow",
          {
            p_room_code: game.room_code,
            p_column: column,
          }
        );

        if (error) {
          setMessage("Coup impossible : " + error.message);
          return;
        }

        const updated = (
          Array.isArray(data) ? data[0] : data
        ) as GameSession | null;

        if (updated?.id) setGame(updated);
      } finally {
        setBusy(false);
      }
    },
    [game, canPlay, state.board, supabase]
  );

  async function copyCode() {
    if (!game) return;

    try {
      await navigator.clipboard.writeText(game.room_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage("Copie impossible. Note le code affiché.");
    }
  }

  function backToMenu() {
    sessionStorage.removeItem("oycea_fourinarow_session_id");
    setGame(null);
    setMessage("");
    onBack();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fff9f7]">
        <LoaderCircle className="animate-spin text-[#c98298]" size={28} />
      </main>
    );
  }

  const winnerText =
    state.winner === myPlayer
      ? "Bravo ! Tu as gagné ! ❤️"
      : "Ton partenaire a gagné ! 💗";

  return (
    <main className="min-h-screen bg-[#fff9f7] px-4 py-7 text-[#49353d] sm:px-8">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={backToMenu}
          className="mb-7 inline-flex items-center gap-2 text-sm text-[#977781]"
        >
          <ArrowLeft size={17} />
          Retour aux jeux
        </button>

        <header className="mb-7 text-center">
          <span className="text-sm tracking-widest text-[#bd8296]">
            OYCEA · À DEUX
          </span>
          <h1 className="mt-3 text-4xl font-medium">
            4 in a <span className="font-serif italic text-[#cc819a]">Row</span>
          </h1>
          <p className="mt-3 text-sm text-[#907b82]">
            Quatre jetons alignés pour gagner. À toi de jouer !
          </p>
        </header>

        {message && (
          <p
            role="status"
            className="mb-5 rounded-2xl border border-[#f0d2d9] bg-white p-4 text-sm text-[#a34d68]"
          >
            {message}
          </p>
        )}

        {!game ? (
          <div className="space-y-5 rounded-3xl border border-[#f0dfe3] bg-white p-6 sm:p-8">
            <button
              onClick={() => void createRoom()}
              disabled={busy}
              className="w-full rounded-full bg-[#c98298] px-5 py-4 font-medium text-white disabled:opacity-60"
            >
              {busy ? "Création…" : "Créer une salle"}
            </button>

            <div className="flex items-center gap-3 text-xs text-[#b29aa1]">
              <div className="h-px flex-1 bg-[#f0dfe3]" />
              OU
              <div className="h-px flex-1 bg-[#f0dfe3]" />
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void joinRoom();
              }}
              className="space-y-3"
            >
              <label className="block text-sm font-medium">
                Rejoindre avec un code
              </label>
              <input
                value={roomInput}
                onChange={(event) =>
                  setRoomInput(event.target.value.toUpperCase())
                }
                maxLength={6}
                placeholder="Ex. A7K2PQ"
                required
                className="w-full rounded-full border border-[#eedde1] bg-[#fffafa] px-5 py-3.5 text-center uppercase tracking-[0.25em] outline-none focus:border-[#c98298]"
              />
              <button
                disabled={busy || roomInput.trim().length < 6}
                className="w-full rounded-full border border-[#e8cbd4] px-5 py-3.5 text-sm text-[#ad7187] disabled:opacity-50"
              >
                {busy ? "Connexion…" : "Rejoindre la partie"}
              </button>
            </form>
          </div>
        ) : (
          <>
            <section className="mb-5 rounded-3xl border border-[#f0dfe3] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-[#ad7187]">CODE DE LA SALLE</p>
                  <p className="mt-1 text-2xl font-semibold tracking-[0.2em]">
                    {game.room_code}
                  </p>
                </div>
                <button
                  onClick={() => void copyCode()}
                  className="inline-flex items-center gap-2 rounded-full bg-[#fff2f5] px-4 py-2.5 text-sm text-[#ad7187]"
                >
                  <Copy size={15} />
                  {copied ? "Copié !" : "Copier"}
                </button>
              </div>

              <p className="mt-4 flex items-center gap-2 text-sm text-[#907b82]">
                <Users size={16} />
                {!game.guest_id
                  ? "En attente du deuxième joueur…"
                  : `Tu joues avec les jetons ${myPlayer === "1" ? "rouges" : "jaunes"}.`}
              </p>
            </section>

            <section className="rounded-3xl border border-[#f0dfe3] bg-white p-4 sm:p-6">
              {game.status === "waiting" ? (
                <div className="py-10 text-center">
                  <LoaderCircle
                    className="mx-auto animate-spin text-[#c98298]"
                    size={30}
                  />
                  <h2 className="mt-4 text-lg font-medium">
                    Ta salle est prête !
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#907b82]">
                    Envoie le code à ton partenaire. Le plateau se débloquera
                    dès qu&apos;il aura rejoint la salle.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="h-4 w-4 rounded-full bg-[#e85d67]" />
                      <span>Joueur 1</span>
                    </div>
                    <p className="text-xs text-[#907b82]">
                      {state.winner
                        ? winnerText
                        : state.draw
                          ? "Match nul ! 🤝"
                          : state.turn === myPlayer
                            ? "C'est ton tour !"
                            : "Au tour de ton partenaire…"}
                    </p>
                    <div className="flex items-center gap-2 text-sm">
                      <span>Joueur 2</span>
                      <span className="h-4 w-4 rounded-full bg-[#f5c94e]" />
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#6388c7] p-2 shadow-inner sm:p-3">
                    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                      {state.board.map((cell, index) => {
                        const row = Math.floor(index / COLS);
                        const column = index % COLS;

                        return (
                          <button
                            key={index}
                            type="button"
                            aria-label={`Ligne ${row + 1}, colonne ${column + 1}${cell ? `, joueur ${cell}` : ", case vide"}`}
                            disabled={!canPlay || cell !== null}
                            onClick={() => void playColumn(column)}
                            className={`aspect-square rounded-full border border-black/10 shadow-inner transition ${
                              cell === "1"
                                ? "bg-[#e85d67]"
                                : cell === "2"
                                  ? "bg-[#f5c94e]"
                                  : "bg-[#fff9f7]"
                            } ${
                              canPlay && cell === null
                                ? "cursor-pointer hover:ring-2 hover:ring-white/80"
                                : "cursor-default"
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <p className="mt-4 text-center text-xs text-[#907b82]">
                    {canPlay
                      ? "Choisis une case vide dans la colonne souhaitée."
                      : state.winner || state.draw
                        ? "La partie est terminée."
                        : "Attends ton tour pour jouer."}
                  </p>

                  {(state.winner || state.draw) && (
                    <button
                      onClick={backToMenu}
                      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3.5 text-sm text-white"
                    >
                      <RotateCcw size={16} />
                      Retour aux jeux
                    </button>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
