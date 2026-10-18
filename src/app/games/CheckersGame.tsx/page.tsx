
"use client";

import { useState } from "react";
import { ArrowLeft, Copy, LoaderCircle } from "lucide-react";
import { useOyceaOnlineGame } from "@/lib/oycea/UseOyceaOnlineGame";

type Piece = { player: 1 | 2; king: boolean } | null;
type Board = Piece[][];

type CheckersState = {
  board: Board;
  turn: 1 | 2;
  winner: 1 | 2 | null;
};

function createBoard(): Board {
  return Array.from({ length: 8 }, (_, row) =>
    Array.from({ length: 8 }, (_, col) => {
      if ((row + col) % 2 === 0) return null;
      if (row < 3) return { player: 2 as const, king: false };
      if (row > 4) return { player: 1 as const, king: false };
      return null;
    })
  );
}

function initialState(): CheckersState {
  return { board: createBoard(), turn: 1, winner: null };
}

export default function CheckersGame({
  onBack,
}: {
  onBack: () => void;
}) {
  const online = useOyceaOnlineGame("dames");
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [copied, setCopied] = useState(false);

  const game = online.game;
  const state = game?.game_state as CheckersState | undefined;
  const board = state?.board ?? createBoard();

  async function copyCode() {
    if (!game) return;
    try {
      await navigator.clipboard.writeText(game.room_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      online.setError("Copie impossible. Note le code affiché.");
    }
  }

  async function play(row: number, col: number) {
    if (
      !game ||
      game.status !== "playing" ||
      !state ||
      !online.player ||
      online.player !== state.turn ||
      state.winner ||
      online.busy
    ) return;

    const piece = board[row][col];

    if (!selected) {
      if (piece?.player === online.player) setSelected([row, col]);
      return;
    }

    const [fromRow, fromCol] = selected;
    const moving = board[fromRow][fromCol];

    if (!moving) {
      setSelected(null);
      return;
    }

    if (piece?.player === online.player) {
      setSelected([row, col]);
      return;
    }

    const dr = row - fromRow;
    const dc = col - fromCol;
    const forward = moving.player === 1 ? -1 : 1;
    const directions = moving.king ? [-1, 1] : [forward];

    let capture = false;

    if (
      Math.abs(dc) === 1 &&
      directions.includes(dr) &&
      !piece
    ) {
      // Déplacement diagonal.
    } else if (
      Math.abs(dc) === 2 &&
      Math.abs(dr) === 2 &&
      !piece &&
      directions.includes(Math.sign(dr))
    ) {
      const middle = board[fromRow + dr / 2][fromCol + dc / 2];
      if (!middle || middle.player === online.player) {
        setSelected(null);
        return;
      }
      capture = true;
    } else {
      setSelected(null);
      return;
    }

    const nextBoard = board.map((line) => [...line]);
    nextBoard[row][col] = {
      ...moving,
      king:
        moving.king ||
        (moving.player === 1 && row === 0) ||
        (moving.player === 2 && row === 7),
    };
    nextBoard[fromRow][fromCol] = null;

    if (capture) {
      nextBoard[fromRow + dr / 2][fromCol + dc / 2] = null;
    }

    const opponent: 1 | 2 = online.player === 1 ? 2 : 1;
    const remaining = nextBoard.flat().filter(
      (p) => p?.player === opponent
    );

    const nextState: CheckersState = {
      board: nextBoard,
      turn: opponent,
      winner: remaining.length === 0 ? online.player : null,
    };

    setSelected(null);
    await online.updateGame(
      nextState,
      nextState.winner ? "finished" : "playing"
    );
  }

  return (
    <main className="min-h-screen bg-[#fff9f7] px-4 py-6 text-[#49353d] sm:px-8">
      <div className="mx-auto max-w-xl">
        <button onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-sm text-[#977781]">
          <ArrowLeft size={17} /> Retour aux jeux
        </button>

        <section className="rounded-3xl border border-[#f0dfe3] bg-white p-4 shadow-sm sm:p-6">
          <p className="text-xs tracking-widest text-[#ad7187]">OYCEA · DUEL EN LIGNE</p>
          <h1 className="mt-2 text-3xl font-medium">Jeu de dames</h1>

          {online.error && (
            <p role="alert" className="mt-4 rounded-xl bg-[#fff0f4] p-3 text-sm text-[#a34d68]">
              {online.error}
            </p>
          )}

          {!game && (
            <div className="mt-6 space-y-4">
              <button
                onClick={() => void online.createGame(initialState())}
                disabled={online.busy || !online.userId}
                className="w-full rounded-full bg-[#c98298] px-5 py-3 text-white disabled:opacity-50"
              >
                {online.busy ? "Création…" : "Créer une partie"}
              </button>

              <div className="border-t border-[#f0dfe3] pt-4">
                <label htmlFor="checkers-code" className="text-sm font-medium">
                  Rejoindre ton partenaire
                </label>
                <input
                  id="checkers-code"
                  value={online.roomCode}
                  onChange={(e) => online.setRoomCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  placeholder="CODE À 6 CARACTÈRES"
                  className="mt-2 w-full rounded-xl border border-[#eedde1] px-4 py-3 uppercase outline-none focus:border-[#c98298]"
                />
                <button
                  onClick={() => void online.joinGame()}
                  disabled={online.busy || online.roomCode.trim().length !== 6}
                  className="mt-3 w-full rounded-full border border-[#e9d1d8] px-5 py-3 text-[#ad7187] disabled:opacity-50"
                >
                  Rejoindre la salle
                </button>
              </div>
            </div>
          )}

          {game && (
            <>
              <div className="mt-5 rounded-2xl bg-[#fff9f7] p-4">
                <p className="text-xs text-[#907b82]">CODE DE LA SALLE</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="text-2xl font-semibold tracking-[0.2em]">{game.room_code}</span>
                  <button onClick={() => void copyCode()} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm text-[#ad7187]">
                    <Copy size={15} /> {copied ? "Copié" : "Copier"}
                  </button>
                </div>
                <p className="mt-2 text-sm text-[#907b82]">
                  {game.status === "waiting"
                    ? "En attente du deuxième joueur…"
                    : game.status === "finished"
                      ? `Partie terminée. ${state?.winner === online.player ? "Tu as gagné !" : `Le joueur ${state?.winner} a gagné.`}`
                      : state?.winner
                        ? `Le joueur ${state.winner} a gagné !`
                        : online.player === state?.turn
                          ? "C'est ton tour."
                          : "C'est au tour de ton partenaire."}
                </p>
                <p className="mt-1 text-xs text-[#907b82]">
                  {online.player === 1 ? "Tu es le joueur rose." : "Tu es le joueur prune."}
                </p>
              </div>

              <div className="mt-5 grid grid-cols-8 overflow-hidden rounded-xl border-4 border-[#49353d]">
                {board.map((line, row) =>
                  line.map((piece, col) => {
                    const dark = (row + col) % 2 === 1;
                    const isSelected = selected?.[0] === row && selected?.[1] === col;

                    return (
                      <button
                        key={`${row}-${col}`}
                        onClick={() => void play(row, col)}
                        disabled={game.status !== "playing" || online.player !== state?.turn || online.busy}
                        aria-label={`Case ${row + 1}, ${col + 1}`}
                        className={`flex aspect-square items-center justify-center ${
                          dark ? "bg-[#80616d]" : "bg-[#f8e9ed]"
                        } ${isSelected ? "ring-4 ring-inset ring-amber-300" : ""}`}
                      >
                        {piece && (
                          <span className={`flex h-[72%] w-[72%] items-center justify-center rounded-full border-2 shadow-sm ${
                            piece.player === 1 ? "border-white bg-[#d58ba2]" : "border-[#d7c2cb] bg-[#49353d]"
                          }`}>
                            {piece.king && <span className="text-sm font-bold text-white">D</span>}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {online.busy && (
                <p className="mt-3 flex items-center justify-center gap-2 text-sm text-[#907b82]">
                  <LoaderCircle size={15} className="animate-spin" /> Synchronisation…
                </p>
              )}

              {game.status === "finished" && (
                <button
                  onClick={() => {
                    online.setGame(null);
                    online.setRoomCode("");
                    setSelected(null);
                  }}
                  className="mt-4 w-full rounded-full bg-[#c98298] px-5 py-3 text-white"
                >
                  Créer une nouvelle partie
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
