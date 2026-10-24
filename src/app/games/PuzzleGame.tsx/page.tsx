/* eslint-disable react-hooks/purity */
"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Check, Copy, Grid2X2, ImagePlus, LoaderCircle, RotateCcw, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOyceaOnlineGame } from "@/lib/oycea/UseOyceaOnlineGame";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
type PuzzleState = {
  size: 3 | 4 | 5;
  imageUrl: string;
  /** Tableau de longueur size*size.
   *  board[i] = -1 → case vide
   *  board[i] = n → numéro de la pièce (0..size*size-1) placée ici
   */
  board: number[];
  /** Indique quelles pièces ont déjà été posées (pour les retirer du sac) */
  placed: boolean[];
  moves: number;
  /** Ordre mélangé des pièces dans le "sac" (indices des pièces) */
  bag: number[];
};

type PuzzleStatus = "waiting" | "playing" | "finished";

const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1200&q=85";

function createPuzzle(size: 3 | 4 | 5, imageUrl: string): PuzzleState {
  const total = size * size;
  const bag = Array.from({ length: total }, (_, i) => i);
  // Mélange de Fisher-Yates du sac
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }

  return {
    size,
    imageUrl,
    board: Array(total).fill(-1), // toutes les cases vides
    placed: Array(total).fill(false),
    moves: 0,
    bag,
  };
}

function isSolved(board: number[]): boolean {
  return board.every((tile, index) => tile === index);
}

// ---------------------------------------------------------------------------
// COMPOSANT
// ---------------------------------------------------------------------------
export default function PuzzleGame({ onBack }: { onBack: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const online = useOyceaOnlineGame(
    "puzzle" as unknown as Parameters<typeof useOyceaOnlineGame>[0],
  );

  const [size, setSize] = useState<3 | 4 | 5>(3);
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [chosenImage, setChosenImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedBagPiece, setSelectedBagPiece] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const game = online.game;
  const rawPuzzle = game?.game_state as PuzzleState | undefined;

  // On utilise l'image choisie localement si le serveur n'a pas encore
  // renvoyé l'état (ou renvoie encore l'image par défaut).
  const puzzle: PuzzleState | undefined = rawPuzzle
    ? {
        ...rawPuzzle,
        imageUrl:
          rawPuzzle.imageUrl && rawPuzzle.imageUrl !== DEFAULT_IMAGE
            ? rawPuzzle.imageUrl
            : chosenImage || rawPuzzle.imageUrl || DEFAULT_IMAGE,
      }
    : undefined;

  const activeSize = puzzle?.size ?? size;
  const finished = game?.status === "finished";
  const canPlay = game?.status === "playing" && !finished;

  // -------------------------------------------------------------------------
  // COMPRESSION D'IMAGE (canvas)
  // -------------------------------------------------------------------------
  function compressImage(file: File, maxWidth = 1200): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ratio = Math.min(maxWidth / img.width, 1);
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas indisponible."));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Compression impossible."));
          },
          "image/jpeg",
          0.85,
        );
      };
      img.onerror = () => reject(new Error("Image invalide."));
      img.src = URL.createObjectURL(file);
    });
  }

  // -------------------------------------------------------------------------
  // UPLOAD D'IMAGE (avec compression + préchargement)
  // -------------------------------------------------------------------------
  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setLocalError("Le fichier doit être une image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setLocalError("L'image est trop lourde (max 10 Mo).");
      return;
    }

    setUploading(true);
    setLocalError("");

    try {
      // Compression avant upload (JPEG 85%, max 1200px de large)
      const compressed = await compressImage(file);
      const fileName = `puzzle-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("puzzle-images")
        .upload(fileName, compressed, {
          cacheControl: "3600",
          upsert: false,
          contentType: "image/jpeg",
        });

      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage
        .from("puzzle-images")
        .getPublicUrl(fileName);

      // Préchargement pour s'assurer que l'image est accessible
      await new Promise<void>((resolve, reject) => {
        const testImg = new Image();
        testImg.onload = () => resolve();
        testImg.onerror = () => reject(new Error("Image non accessible."));
        testImg.src = publicUrl.publicUrl;
      });

      setCustomImage(publicUrl.publicUrl);
    } catch (e) {
      setLocalError(
        e instanceof Error ? e.message : "Impossible d'uploader l'image.",
      );
    } finally {
      setUploading(false);
    }
  }

  function removeCustomImage() {
    setCustomImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // -------------------------------------------------------------------------
  // CRÉATION / REJOINDRE
  // -------------------------------------------------------------------------
  async function createRoom() {
    setSelectedBagPiece(null);
    setLocalError("");
    const imageToUse = customImage || DEFAULT_IMAGE;
    setChosenImage(imageToUse);
    await online.createGame(createPuzzle(size, imageToUse));
  }

  async function joinRoom() {
    setSelectedBagPiece(null);
    setLocalError("");
    await online.joinGame();
  }

  async function copyCode() {
    if (!game) return;
    try {
      await navigator.clipboard.writeText(game.room_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setLocalError("Copie impossible. Note le code affiché.");
    }
  }

  // -------------------------------------------------------------------------
  // MÉCANIQUE DE PLACEMENT
  // -------------------------------------------------------------------------

  // Prendre une pièce du sac
  function pickFromBag(pieceIdx: number) {
    if (!canPlay || online.busy) return;
    setSelectedBagPiece(pieceIdx === selectedBagPiece ? null : pieceIdx);
  }

  // Poser la pièce sélectionnée sur une case du plateau
  async function dropOnBoard(cellIndex: number) {
    if (!canPlay || !puzzle || online.busy) return;
    if (selectedBagPiece === null) return;
    if (puzzle.board[cellIndex] !== -1) return;

    const nextBoard = [...puzzle.board];
    nextBoard[cellIndex] = selectedBagPiece;

    const nextPlaced = [...puzzle.placed];
    nextPlaced[selectedBagPiece] = true;

    const nextBag = puzzle.bag.filter((p) => p !== selectedBagPiece);

    const nextPuzzle: PuzzleState = {
      ...puzzle,
      board: nextBoard,
      placed: nextPlaced,
      bag: nextBag,
      moves: puzzle.moves + 1,
    };

    setSelectedBagPiece(null);

    const nextStatus: PuzzleStatus = isSolved(nextBoard)
      ? "finished"
      : "playing";

    await online.updateGame(nextPuzzle, nextStatus);
  }

  // Retirer une pièce du plateau (retourne dans le sac)
  async function removeFromBoard(cellIndex: number) {
    if (!canPlay || !puzzle || online.busy) return;
    const piece = puzzle.board[cellIndex];
    if (piece === -1) return;

    const nextBoard = [...puzzle.board];
    nextBoard[cellIndex] = -1;

    const nextPlaced = [...puzzle.placed];
    nextPlaced[piece] = false;

    // Remettre la pièce dans le sac, à une position aléatoire
    const nextBag = [...puzzle.bag];
    const insertAt = Math.floor(Math.random() * (nextBag.length + 1));
    nextBag.splice(insertAt, 0, piece);

    const nextPuzzle: PuzzleState = {
      ...puzzle,
      board: nextBoard,
      placed: nextPlaced,
      bag: nextBag,
      moves: puzzle.moves + 1,
    };

    await online.updateGame(nextPuzzle, "playing");
  }

  function resetSelection() {
    setSelectedBagPiece(null);
    setLocalError("");
  }

  function returnToLobby() {
    online.setGame(null);
    online.setRoomCode("");
    setSelectedBagPiece(null);
    setCustomImage(null);
    setChosenImage(null);
    setLocalError("");
  }

  // -------------------------------------------------------------------------
  // RENDU D'UNE PIÈCE
  // -------------------------------------------------------------------------
  function pieceStyle(pieceIdx: number, sizeValue: number): React.CSSProperties {
    const row = Math.floor(pieceIdx / sizeValue);
    const col = pieceIdx % sizeValue;
    return {
      backgroundImage: `url("${puzzle?.imageUrl || DEFAULT_IMAGE}")`,
      backgroundSize: `${sizeValue * 100}% ${sizeValue * 100}%`,
      backgroundPosition: `${(col / (sizeValue - 1)) * 100}% ${
        (row / (sizeValue - 1)) * 100
      }%`,
    };
  }

  if (!online.userId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fff9f7]">
        <LoaderCircle className="animate-spin text-[#c98298]" size={28} />
      </main>
    );
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
              <h1 className="mt-2 text-3xl font-medium">Notre puzzle</h1>
              <p className="mt-2 text-sm leading-6 text-[#907b82]">
                Choisissez une photo, puis assemblez-la ensemble.
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

          {/* ------------------------------------------------------------- */}
          {/* LOBBY                                                          */}
          {/* ------------------------------------------------------------- */}
          {!game && (
            <div className="mt-7 space-y-6">
              {/* Choix de la difficulté */}
              <div>
                <h2 className="font-medium">Difficulté</h2>
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
              </div>

              {/* Choix de l'image */}
              <div>
                <h2 className="font-medium">Photo du puzzle</h2>
                <p className="mt-1 text-xs text-[#907b82]">
                  Une image par défaut, ou la vôtre (max 10 Mo).
                </p>

                <div className="mt-3">
                  {customImage ? (
                    <div className="relative overflow-hidden rounded-2xl border border-[#f0dfe3]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={customImage}
                        alt="Image personnalisée"
                        className="h-48 w-full object-cover"
                      />
                      <button
                        onClick={removeCustomImage}
                        className="absolute right-2 top-2 rounded-full bg-white/90 p-2 text-[#a34d68] shadow"
                        aria-label="Retirer l'image"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-[#f0dfe3]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={DEFAULT_IMAGE}
                        alt="Image par défaut"
                        className="h-48 w-full rounded-2xl object-cover"
                      />
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-[#e9d1d8] px-4 py-3 text-sm text-[#ad7187] transition hover:bg-[#fff0f4] disabled:opacity-50"
                    >
                      {uploading ? (
                        <LoaderCircle size={16} className="animate-spin" />
                      ) : (
                        <ImagePlus size={16} />
                      )}
                      {uploading ? "Upload…" : "Choisir une photo"}
                    </button>
                    {customImage && (
                      <button
                        onClick={removeCustomImage}
                        className="rounded-full border border-[#e9d1d8] px-4 py-3 text-sm text-[#ad7187]"
                      >
                        <RotateCcw size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => void createRoom()}
                disabled={online.busy || !online.userId || uploading}
                className="w-full rounded-full bg-[#c98298] px-5 py-3.5 font-medium text-white transition hover:bg-[#b76e87] disabled:opacity-50"
              >
                {online.busy ? "Création de la salle…" : "Créer une partie"}
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-[#f0dfe3]" />
                <span className="text-xs text-[#b29aa1]">OU</span>
                <div className="h-px flex-1 bg-[#f0dfe3]" />
              </div>

              <div>
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
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* EN JEU                                                         */}
          {/* ------------------------------------------------------------- */}
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
                  <p className="mt-3 font-medium">Votre puzzle vous attend</p>
                  <p className="mt-2 text-sm leading-6 text-[#907b82]">
                    Ouvre Oycea sur le deuxième téléphone et rejoins cette
                    salle avec le code ci-dessus.
                  </p>
                </div>
              )}

              {puzzle && (
                <>
                  {/* Aperçu de l'image utilisée */}
                  <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#fff9f7] p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={puzzle.imageUrl}
                      alt="Aperçu"
                      className="h-14 w-14 rounded-lg border border-[#f0dfe3] object-cover"
                    />
                    <p className="text-xs text-[#907b82]">
                      Image du puzzle.{" "}
                      {puzzle.imageUrl.includes("puzzle-images")
                        ? "Photo personnalisée."
                        : "Image par défaut."}
                    </p>
                  </div>

                  {/* Statistiques */}
                  <div className="mt-6 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {finished ? "Puzzle terminé !" : "À vous deux de jouer"}
                      </p>
                      <p className="mt-1 text-xs text-[#907b82]">
                        {puzzle.bag.length} pièce
                        {puzzle.bag.length > 1 ? "s" : ""} restante
                        {puzzle.bag.length > 1 ? "s" : ""} ·{" "}
                        {puzzle.moves} action{puzzle.moves > 1 ? "s" : ""}
                      </p>
                    </div>
                    <button
                      onClick={resetSelection}
                      aria-label="Annuler la sélection"
                      className="rounded-full bg-[#fff0f4] p-3 text-[#ad7187]"
                    >
                      <RotateCcw size={17} />
                    </button>
                  </div>

                  {/* Zone plateau (grille vide au départ) */}
                  <div className="mt-4">
                    <p className="mb-2 text-xs uppercase tracking-wide text-[#907b82]">
                      Plateau
                    </p>
                    <div
                      className="grid aspect-square w-full overflow-hidden rounded-2xl border-4 border-[#f0dfe3] bg-[#fffafc] shadow-sm"
                      style={{
                        gridTemplateColumns: `repeat(${activeSize}, minmax(0, 1fr))`,
                      }}
                    >
                      {puzzle.board.map((piece, cellIdx) => {
                        const isEmpty = piece === -1;
                        const isCorrect = piece === cellIdx;
                        const clickable = canPlay && !isEmpty;
                        return (
                          <button
                            key={cellIdx}
                            onClick={() => {
                              if (selectedBagPiece !== null) {
                                void dropOnBoard(cellIdx);
                              } else if (!isEmpty) {
                                void removeFromBoard(cellIdx);
                              }
                            }}
                            disabled={!canPlay || online.busy}
                            className={`relative min-h-0 min-w-0 border border-white/70 transition ${
                              isEmpty
                                ? "bg-[#fffafc] hover:bg-[#fff0f4]"
                                : ""
                            } ${
                              clickable ? "cursor-pointer" : "cursor-default"
                            }`}
                            aria-label={
                              isEmpty
                                ? `Case vide ${cellIdx + 1}`
                                : `Pièce posée en ${cellIdx + 1}`
                            }
                            style={
                              !isEmpty ? pieceStyle(piece, activeSize) : undefined
                            }
                          >
                            {!isEmpty && isCorrect && (
                              <span className="absolute right-1 top-1 rounded-full bg-green-500 p-0.5 text-white">
                                <Check size={10} />
                              </span>
                            )}
                            {isEmpty && selectedBagPiece !== null && (
                              <span className="absolute inset-0 flex items-center justify-center text-2xl text-[#c98298]">
                                +
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Zone sac de pièces */}
                  {puzzle.bag.length > 0 && (
                    <div className="mt-5">
                      <p className="mb-2 text-xs uppercase tracking-wide text-[#907b82]">
                        Pièces à placer ({puzzle.bag.length})
                      </p>
                      <div className="rounded-2xl border border-[#f0dfe3] bg-[#fffafc] p-3">
                        <div className="flex flex-wrap gap-2">
                          {puzzle.bag.map((pieceIdx) => {
                            const isSelected = selectedBagPiece === pieceIdx;
                            return (
                              <button
                                key={pieceIdx}
                                onClick={() => pickFromBag(pieceIdx)}
                                disabled={!canPlay || online.busy}
                                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                                  isSelected
                                    ? "border-[#c98298] ring-4 ring-[#fff0f4]"
                                    : "border-white"
                                }`}
                                style={pieceStyle(pieceIdx, activeSize)}
                                aria-label={`Prendre la pièce ${pieceIdx + 1}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="mt-4 text-center text-xs leading-5 text-[#907b82]">
                    {selectedBagPiece !== null
                      ? "Tape une case vide du plateau pour poser la pièce."
                      : "Tape une pièce dans le sac pour la prendre, ou une pièce du plateau pour la retirer."}
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