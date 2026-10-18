/* eslint-disable react/no-string-refs */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  Heart,
  LoaderCircle,
  RotateCcw,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Game = {
  id: string;
  room_code: string;
  player_x: string;
  player_o: string | null;
  board: string[];
  current_turn: "X" | "O";
  winner: "X" | "O" | "draw" | null;
  status: "waiting" | "playing" | "finished";
};

const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function getWinner(board: string[]): "X" | "O" | "draw" | null {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as "X" | "O";
    }
  }

  return board.every(Boolean) ? "draw" : null;
}

function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function MorpionGame({
  onBack,
}: {
  onBack: () => void;
}) {  const [userId, setUserId] = useState("");
  const [game, setGame] = useState<Game | null>(null);
  const [roomInput, setRoomInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const supabase = createClient();

  const loadGame = useCallback(async (gameId: string) => {
    const { data, error } = await supabase
      .from("oycea_games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (error) {
      setMessage("Impossible de charger cette partie.");
      return;
    }

    setGame(data as Game);
  }, [supabase]);

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

      const savedGameId = sessionStorage.getItem("oycea_game_id");

      if (savedGameId) {
        const { data: savedGame } = await supabase
          .from("oycea_games")
          .select("*")
          .eq("id", savedGameId)
          .maybeSingle();

        if (active && savedGame) {
          const currentGame = savedGame as Game;

          if (
            currentGame.player_x === data.user.id ||
            currentGame.player_o === data.user.id
          ) {
            setGame(currentGame);
          }
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
      .channel(`oycea-game-${game.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "oycea_games",
          filter: `id=eq.${game.id}`,
        },
        (payload) => {
          if (payload.new && "id" in payload.new) {
            setGame(payload.new as Game);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [game?.id, supabase]);

  async function createGame() {
    if (!userId || busy) return;

    setBusy(true);
    setMessage("");

    try {
      let created: Game | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        const code = generateRoomCode();

        const { data, error } = await supabase
          .from("oycea_games")
          .insert({
            room_code: code,
            player_x: userId,
            board: ["", "", "", "", "", "", "", "", ""],
            current_turn: "X",
            status: "waiting",
          })
          .select("*")
          .single();

        if (!error && data) {
          created = data as Game;
          break;
        }

        if (error && error.code !== "23505") {
          setMessage(error.message);
          break;
        }
      }

      if (created) {
        sessionStorage.setItem("oycea_game_id", created.id);
        setGame(created);
      } else if (!message) {
        setMessage("Impossible de créer la partie. Réessaie.");
      }
    } finally {
      setBusy(false);
    }
  }


async function joinGame() {
  if (!userId || busy) return;

  const code = roomInput.trim().toUpperCase();

  if (!code) {
    setMessage("Entre le code de la partie.");
    return;
  }

  setBusy(true);
  setMessage("");

  try {
    const { data, error } = await supabase.rpc("join_oycea_game", {
      p_room_code: code,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    const joined = Array.isArray(data) ? data[0] : data;

    if (!joined) {
      setMessage("Aucune partie trouvée avec ce code.");
      return;
    }

    sessionStorage.setItem("oycea_game_id", joined.id);
    setGame(joined as Game);
  } catch {
    setMessage("Une erreur est survenue. Réessaie.");
  } finally {
    setBusy(false);
  }
}


  async function playMove(index: number) {
    if (!game || busy || game.status !== "playing" || game.board[index]) {
      return;
    }

    const mySymbol = game.player_x === userId ? "X" : "O";

    if (game.current_turn !== mySymbol) {
      setMessage("C'est au tour de ton partenaire.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const newBoard = [...game.board];
      newBoard[index] = mySymbol;

      const winner = getWinner(newBoard);
      const nextStatus = winner ? "finished" : "playing";

      const { data, error } = await supabase
        .from("oycea_games")
        .update({
          board: newBoard,
          current_turn: mySymbol === "X" ? "O" : "X",
          winner,
          status: nextStatus,
        })
        .eq("id", game.id)
        .eq("current_turn", mySymbol)
        .eq("status", "playing")
        .eq("board", JSON.stringify(game.board))
        .select("*")
        .maybeSingle();

      if (error || !data) {
        setMessage("Le plateau a changé. Attends la mise à jour et réessaie.");
        await loadGame(game.id);
        return;
      }

      setGame(data as Game);
    } finally {
      setBusy(false);
    }
  }

  async function restartGame() {
    if (!game || busy || game.player_x !== userId) return;

    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("oycea_games")
        .update({
          board: ["", "", "", "", "", "", "", "", ""],
          current_turn: "X",
          winner: null,
          status: game.player_o ? "playing" : "waiting",
        })
        .eq("id", game.id)
        .eq("board", JSON.stringify(game.board))
        .select("*")
        .maybeSingle();

      if (error || !data) {
        setMessage("Impossible de relancer la partie. Réessaie.");
        return;
      }

      setGame(data as Game);
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!game) return;

    try {
      await navigator.clipboard.writeText(game.room_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage("Copie impossible. Note le code affiché.");
    }
  }

  function leaveGame() {
    sessionStorage.removeItem("oycea_game_id");
    setGame(null);
    setMessage("");
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <LoaderCircle className="animate-spin text-[#c98298]" size={28} />
      </main>
    );
  }

  const mySymbol =
    game && game.player_x === userId
      ? "X"
      : game?.player_o === userId
        ? "O"
        : null;

  let statusText = "Préparez-vous à jouer";

  if (game?.status === "waiting") {
    statusText = "En attente de ton partenaire...";
  } else if (game?.status === "finished" && game.winner === "draw") {
    statusText = "Match nul ! Une revanche ?";
  } else if (game?.status === "finished" && game.winner) {
    statusText =
      game.winner === mySymbol
        ? "Tu as gagné ! Bien joué."
        : "Ton partenaire a gagné cette fois.";
  } else if (game?.status === "playing") {
    statusText =
      game.current_turn === mySymbol
        ? "À toi de jouer !"
        : "C'est au tour de ton partenaire.";
  }

  return (
    <main className="min-h-screen bg-[#fff9f7] px-5 py-8 text-[#49353d] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-center justify-between">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm text-[#977781] transition hover:text-[#49353d]"
          >
            <ArrowLeft size={17} />
            Tout les jeux
          </button>

          <Link href="/" className="text-2xl font-semibold tracking-tight">
            oycea<span className="text-[#d58ba2]">.</span>
          </Link>
        </header>

        <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:items-center">
          <section>
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#f1dce2] bg-white px-4 py-2 text-xs tracking-wide text-[#ad7187]">
              <Heart size={13} />
              GAME NIGHT · 01
            </span>

            <h1 className="max-w-lg text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
              Une petite partie,
              <br />
              <span className="font-serif italic text-[#cc819a]">
                juste nous deux.
              </span>
            </h1>

            <p className="mt-5 max-w-md leading-7 text-[#907b82]">
              Trois symboles alignés, un peu de compétition et une bonne raison
              de rester encore quelques minutes ensemble.
            </p>

            {message && (
              <p
                role="status"
                className="mt-5 rounded-xl border border-[#f0d2d9] bg-white px-4 py-3 text-sm text-[#a34d68]"
              >
                {message}
              </p>
            )}

            {!game ? (
              <div className="mt-8 max-w-md space-y-5 rounded-3xl border border-[#f1e1e4] bg-white p-6 shadow-[0_18px_60px_rgba(125,76,91,0.06)]">
                <div>
                  <h2 className="font-medium">Créer une partie</h2>
                  <p className="mt-1 text-sm text-[#9c858d]">
                    Lance une partie et partage son code.
                  </p>
                  <button
                    onClick={createGame}
                    disabled={busy}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#b87188] disabled:opacity-60"
                  >
                    {busy ? <LoaderCircle size={17} className="animate-spin" /> : <Heart size={16} />}
                    Créer notre partie
                  </button>
                </div>

                <div className="h-px bg-[#f3e8ea]" />

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void joinGame();
                  }}
                >
                  <label htmlFor="room-code" className="text-sm font-medium">
                    Rejoindre une partie
                  </label>
                  <div className="mt-3 flex gap-2">
                    <input
                      id="room-code"
                      value={roomInput}
                      onChange={(event) => setRoomInput(event.target.value.toUpperCase())}
                      maxLength={6}
                      placeholder="CODE123"
                      className="min-w-0 flex-1 rounded-full border border-[#eedde1] bg-[#fffafa] px-4 py-3 text-sm uppercase outline-none transition focus:border-[#c98298]"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-full border border-[#e9d1d8] px-5 py-3 text-sm font-medium transition hover:bg-[#fff2f5] disabled:opacity-60"
                    >
                      Rejoindre
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="mt-8 rounded-3xl border border-[#f1e1e4] bg-white p-6 shadow-[0_18px_60px_rgba(125,76,91,0.06)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs tracking-wide text-[#a78b93]">
                      CODE DE LA PARTIE
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-[0.2em]">
                      {game.room_code}
                    </p>
                  </div>
                  <button
                    onClick={copyCode}
                    className="inline-flex items-center gap-2 rounded-full bg-[#fff0f4] px-4 py-2.5 text-sm text-[#ad7187]"
                  >
                    <Copy size={15} />
                    {copied ? "Copié !" : "Copier"}
                  </button>
                </div>

                <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#fff9f7] p-4">
                  <Users size={19} className="text-[#c98298]" />
                  <div>
                    <p className="text-sm font-medium">
                      {game.player_o ? "Vous êtes deux !" : "Il manque quelqu'un..."}
                    </p>
                    <p className="mt-1 text-xs text-[#a78b93]">
                      {mySymbol === "X" ? "Tu joues avec les X" : "Tu joues avec les O"}
                      {" · "}
                      {game.player_o ? "Partie prête" : "Envoie le code à ton partenaire"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={leaveGame}
                  className="mt-5 text-sm text-[#a78b93] underline underline-offset-4 hover:text-[#49353d]"
                >
                  Quitter cette partie
                </button>
              </div>
            )}
          </section>

          <section className="rounded-[2rem] border border-[#f0dfe3] bg-white p-5 shadow-[0_24px_80px_rgba(125,76,91,0.08)] sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs tracking-[0.16em] text-[#b28a97]">
                  NOTRE PETIT DUEL
                </p>
                <h2 className="mt-2 text-xl font-medium">Morpion à deux</h2>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff0f4] text-[#c98298]">
                <Heart size={21} />
              </div>
            </div>

            {game ? (
              <>
                <div className="mb-5 flex items-center justify-between rounded-2xl bg-[#fff9f7] px-4 py-3">
                  <span className="text-sm text-[#8e737d]">{statusText}</span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#b8768d]">
                    {mySymbol ?? "-"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {game.board.map((cell, index) => {
                    const isWinningCell = WINNING_LINES.some(
                      (line) =>
                        line.includes(index) &&
                        game.winner !== null &&
                        game.winner !== "draw" &&
                        line.every((position) => game.board[position] === game.winner)
                    );

                    return (
                      <button
                        key={index}
                        onClick={() => void playMove(index)}
                        disabled={
                          busy ||
                          game.status !== "playing" ||
                          Boolean(cell) ||
                          game.current_turn !== mySymbol
                        }
                        aria-label={`Case ${index + 1}${cell ? ` : ${cell}` : ""}`}
                        className={`flex aspect-square items-center justify-center rounded-2xl border text-4xl font-medium transition sm:rounded-3xl sm:text-5xl ${
                          isWinningCell
                            ? "border-[#d9a3b3] bg-[#fce8ee]"
                            : cell
                              ? "border-[#f0e1e5] bg-[#fff9f7]"
                              : "border-[#f0e1e5] bg-[#fffafa] hover:border-[#dca8b7] hover:bg-[#fff0f4]"
                        } disabled:cursor-default`}
                      >
                        <span className={cell === "X" ? "text-[#c98298]" : "text-[#9e91c7]"}>
                          {cell}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 flex items-center justify-between gap-3 text-xs text-[#a78b93]">
                  <span>X commence toujours</span>
                  {game.status === "finished" && (
                    <button
                      onClick={restartGame}
                      disabled={busy || game.player_x !== userId}
                      className="inline-flex items-center gap-2 rounded-full bg-[#fff0f4] px-4 py-2.5 text-sm text-[#ad7187] disabled:opacity-50"
                    >
                      <RotateCcw size={14} />
                      Rejouer
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl bg-[#fff9f7] px-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#fceaf0] text-[#c98298]">
                  <Heart size={28} />
                </div>
                <h3 className="mt-5 text-lg font-medium">Deux joueurs, une grille</h3> 
                <p className="mt-2 max-w-xs text-sm leading-6 text-[#a18a91]">
                  Crée une partie ou rejoins ton partenaire avec son code pour commencer.
                </p>
              </div>
            )}
          </section>
        </div>

        <footer className="mt-12 flex items-center justify-center gap-2 text-xs text-[#b29aa1]">
          <Heart size={12} />
          Un petit monde, rien qu’à nous · Oycea
        </footer>
      </div>
    </main>
  );
}
