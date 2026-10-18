
"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Grid2X2,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { useOyceaOnlineGame } from "@/lib/oycea/UseOyceaOnlineGame";

const PUZZLE_IMAGE =
  "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1200&q=85";

type PuzzleState = {
  size: 3 | 4 | 5;
  tiles: number[];
  moves: number;
};

type PuzzleStatus = "waiting" | "playing" | "finished";

function shuffleTiles(size: number): number[] {
  const tiles = Array.from({ length: size * size }, (_, index) => index);

  // Mélange de Fisher-Yates.
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  // Évite de commencer avec un puzzle déjà résolu.
  if (tiles.every((tile, index) => tile === index)) {
    [tiles[0], tiles[1]] = [tiles[1], tiles[0]];
  }

  return tiles;
}

function createPuzzle(size: 3 | 4 | 5): PuzzleState {
  return {
    size,
    tiles: shuffleTiles(size),
    moves: 0,
  };
}

function isSolved(tiles: number[]): boolean {
  return tiles.every((tile, index) => tile === index);
}

export default function PuzzleGame({
  onBack,
}: {
  onBack: () => void;
}) {
  const online = useOyceaOnlineGame(
    "puzzle" as unknown as Parameters<typeof useOyceaOnlineGame>[0],
  );

  const [size, setSize] = useState<3 | 4 | 5>(3);
  const [selected, setSelected] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState("");

  const game = online.game;
  const puzzle = game?.game_state as PuzzleState | undefined;

  const activeSize = puzzle?.size ?? size;
  const tiles = puzzle?.tiles ?? [];
  const finished = game?.status === "finished";
  const canPlay = game?.status === "playing" && !finished;

  async function createRoom() {
    setSelected(null);
    setLocalError("");
    await online.createGame(createPuzzle(size));
  }

  async function joinRoom() {
    setSelected(null);
    setLocalError("");
    await online.joinGame();
  }

  async function copyCode() {
    if (!game) return;

    try {
      await navigator.clipboard.writeText(game.room_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setLocalError("Copie impossible. Note le code affiché.");
    }
  }

  async function moveTile(index: number) {
    if (!canPlay || !puzzle || online.busy) return;

    if (selected === null) {
      setSelected(index);
      return;
    }

    if (selected === index) {
      setSelected(null);
      return;
    }

    const nextTiles = [...puzzle.tiles];

    [nextTiles[selected], nextTiles[index]] = [
      nextTiles[index],
      nextTiles[selected],
    ];

    const nextPuzzle: PuzzleState = {
      ...puzzle,
      tiles: nextTiles,
      moves: puzzle.moves + 1,
    };

    setSelected(null);

    const nextStatus: PuzzleStatus = isSolved(nextTiles)
      ? "finished"
      : "playing";

    await online.updateGame(nextPuzzle, nextStatus);
  }

  function resetLocalSelection() {
    setSelected(null);
    setLocalError("");
  }

  function returnToLobby() {
    online.setGame(null);
    online.setRoomCode("");
    setSelected(null);
    setLocalError("");
  }

  return (
    <main className="min-h-screen bg-[#fff9f7] px-4 py-6 text-[#49353d] sm:px-8">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 text-sm text-[#977781] transition hover:text-[#49353d]"
        >
          <ArrowLeft size={17} />
          Retour aux jeux
        </button>

        <section className="rounded-3xl border border-[#f0dfe3] bg-white p-5 shadow-sm sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs tracking-widest text-[#ad7187]">
                OYCEA · PUZZLE COLLABORATIF
              </p>
              <h1 className="mt-2 text-3xl font-medium">
                Notre puzzle
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#907b82]">
                Une image, deux téléphones et un objectif commun.
              </p>
            </div>

            <Grid2X2 className="shrink-0 text-[#c98298]" size={28} />
          </div>

          {(online.error || localError) && (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-[#f0d2d9] bg-[#fff0f4] p-3 text-sm text-[#a34d68]"
            >
              {localError || online.error}
            </p>
          )}

          {!game && (
            <div className="mt-7">
              <h2 className="font-medium">Choisissez la difficulté</h2>

              <div className="mt-3 grid grid-cols-3 gap-3">
                {([3, 4, 5] as const).map((value) => (
                  <button
                    key={value}
                    onClick={() => setSize(value)}
                    className={`rounded-2xl border p-3 text-center transition ${
                      size === value
                        ? "border-[#c98298] bg-[#fff0f4] text-[#ad7187]"
                        : "border-[#f0dfe3] bg-white hover:bg-[#fff9f7]"
                    }`}
                  >
                    <span className="block text-xl font-semibold">
                      {value} × {value}
                    </span>
                    <span className="mt-1 block text-xs">
                      {value * value} pièces
                    </span>
                  </button>
                ))}
              </div>

              <p className="mt-3 text-xs leading-5 text-[#907b82]">
                La taille choisie par la personne qui crée la salle sera
                utilisée pour toute la partie.
              </p>

              <button
                onClick={() => void createRoom()}
                disabled={online.busy || !online.userId}
                className="mt-6 w-full rounded-full bg-[#c98298] px-5 py-3.5 font-medium text-white transition hover:bg-[#b76e87] disabled:opacity-50"
              >
                {online.busy ? "Création de la salle…" : "Créer une partie"}
              </button>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#f0dfe3]" />
                <span className="text-xs text-[#b29aa1]">OU</span>
                <div className="h-px flex-1 bg-[#f0dfe3]" />
              </div>

              <label
                htmlFor="puzzle-room-code"
                className="text-sm font-medium"
              >
                Rejoindre ton partenaire
              </label>

              <input
                id="puzzle-room-code"
                value={online.roomCode}
                onChange={(event) =>
                  online.setRoomCode(event.target.value.toUpperCase())
                }
                maxLength={6}
                placeholder="CODE À 6 CARACTÈRES"
                className="mt-2 w-full rounded-xl border border-[#eedde1] bg-[#fffafa] px-4 py-3 uppercase outline-none transition focus:border-[#c98298]"
              />

              <button
                onClick={() => void joinRoom()}
                disabled={
                  online.busy || online.roomCode.trim().length !== 6
                }
                className="mt-3 w-full rounded-full border border-[#e9d1d8] px-5 py-3.5 font-medium text-[#ad7187] transition hover:bg-[#fff0f4] disabled:opacity-50"
              >
                {online.busy ? "Connexion…" : "Rejoindre la partie"}
              </button>
            </div>
          )}

          {game && (
            <>
              <div className="mt-6 rounded-2xl bg-[#fff9f7] p-4">
                <p className="text-xs tracking-wide text-[#907b82]">
                  CODE DE LA SALLE
                </p>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-2xl font-semibold tracking-[0.2em]">
                    {game.room_code}
                  </span>

                  <button
                    onClick={() => void copyCode()}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm text-[#ad7187]"
                  >
                    <Copy size={15} />
                    {copied ? "Copié !" : "Copier"}
                  </button>
                </div>

                <p className="mt-3 text-sm leading-6 text-[#907b82]">
                  {game.status === "waiting"
                    ? "En attente de ton partenaire. Envoie-lui le code pour commencer."
                    : finished
                      ? "Bravo ! Vous avez terminé le puzzle ensemble."
                      : `Partie en cours · ${activeSize * activeSize} pièces`}
                </p>
              </div>

              {game.status === "waiting" && (
                <div className="mt-6 rounded-2xl border border-[#f0dfe3] p-5 text-center">
                  <LoaderCircle
                    className="mx-auto animate-spin text-[#c98298]"
                    size={26}
                  />
                  <p className="mt-3 font-medium">
                    Votre puzzle vous attend
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#907b82]">
                    Ouvre Oycea sur le deuxième téléphone et rejoins cette
                    salle avec le code ci-dessus.
                  </p>
                </div>
              )}

              {puzzle && (
                <>
                  <div className="mt-6 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {finished ? "Puzzle terminé !" : "À vous deux de jouer"}
                      </p>
                      <p className="mt-1 text-xs text-[#907b82]">
                        {activeSize * activeSize} pièces · {puzzle.moves} échanges
                      </p>
                    </div>

                    <button
                      onClick={resetLocalSelection}
                      aria-label="Annuler la sélection"
                      className="rounded-full bg-[#fff0f4] p-3 text-[#ad7187]"
                    >
                      <RotateCcw size={17} />
                    </button>
                  </div>

                  <div
                    className="mt-4 grid aspect-square w-full overflow-hidden rounded-2xl border-4 border-white shadow-sm"
                    style={{
                      gridTemplateColumns: `repeat(${activeSize}, minmax(0, 1fr))`,
                    }}
                  >
                    {tiles.map((tile, index) => {
                      const tileRow = Math.floor(tile / activeSize);
                      const tileCol = tile % activeSize;
                      const isCorrect = tile === index;
                      const isSelected = selected === index;

                      return (
                        <button
                          key={index}
                          onClick={() => void moveTile(index)}
                          disabled={!canPlay || online.busy}
                          aria-label={`Pièce ${tile + 1}, position ${index + 1}`}
                          className={`relative min-h-0 min-w-0 overflow-hidden border border-white/70 transition ${
                            isSelected
                              ? "z-10 ring-4 ring-inset ring-[#c98298]"
                              : ""
                          } ${
                            isCorrect ? "" : "cursor-pointer"
                          } disabled:cursor-default`}
                          style={{
                            backgroundImage: `url("${PUZZLE_IMAGE}")`,
                            backgroundSize: `${activeSize * 100}% ${activeSize * 100}%`,
                            backgroundPosition: `${
                              (tileCol / (activeSize - 1)) * 100
                            }% ${
                              (tileRow / (activeSize - 1)) * 100
                            }%`,
                          }}
                        >
                          {isSelected && (
                            <span className="absolute inset-0 bg-white/20" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <p className="mt-4 text-center text-xs leading-5 text-[#907b82]">
                    Touche une pièce, puis touche la case où tu veux la
                    déplacer. Ton partenaire verra le changement en direct.
                  </p>

                  {online.busy && (
                    <p className="mt-3 flex items-center justify-center gap-2 text-sm text-[#907b82]">
                      <LoaderCircle size={15} className="animate-spin" />
                      Synchronisation du puzzle…
                    </p>
                  )}

                  {finished && (
                    <div className="mt-5 rounded-2xl bg-[#fff0f4] p-5 text-center">
                      <Check className="mx-auto text-[#ad7187]" size={28} />
                      <h2 className="mt-2 text-xl font-medium">
                        Vous l&apos;avez fait ensemble !
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-[#907b82]">
                        Toutes les pièces sont à leur place. Une belle
                        collaboration !
                      </p>
                    </div>
                  )}
                </>
              )}

              <button
                onClick={returnToLobby}
                className="mt-6 w-full rounded-full border border-[#e9d1d8] px-5 py-3 text-sm text-[#ad7187] transition hover:bg-[#fff0f4]"
              >
                Quitter cette salle
              </button>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
