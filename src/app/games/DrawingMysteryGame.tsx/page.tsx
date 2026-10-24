
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  Eraser,
  Heart,
  Palette,
  Pencil,
  RotateCcw,
  Sparkles,
  Trophy,
  Users,
  X,
} from "lucide-react";

type Props = {
  onBack: () => void;
};

type Phase = "ready" | "playing" | "revealed";

type Word = {
  value: string;
  category: string;
};

const WORDS: Word[] = [
  { value: "Un cœur", category: "Amour" },
  { value: "Un chat", category: "Animaux" },
  { value: "Une pizza", category: "Nourriture" },
  { value: "Une bague", category: "Amour" },
  { value: "Un soleil", category: "Nature" },
  { value: "Un téléphone", category: "Objets" },
  { value: "Un bisou", category: "Amour" },
  { value: "Un papillon", category: "Animaux" },
  { value: "Une maison", category: "Objets" },
  { value: "Une fleur", category: "Nature" },
  { value: "Un gâteau", category: "Nourriture" },
  { value: "Une étoile", category: "Nature" },
  { value: "Un avion", category: "Objets" },
  { value: "Un ours", category: "Animaux" },
  { value: "Un cadeau", category: "Amour" },
  { value: "Une glace", category: "Nourriture" },
  { value: "Un parapluie", category: "Objets" },
  { value: "Un arc-en-ciel", category: "Nature" },
  { value: "Une couronne", category: "Objets" },
  { value: "Un câlin", category: "Amour" },
];

const COLORS = [
  "#49353d",
  "#c98298",
  "#e74c3c",
  "#e6a23c",
  "#3d9970",
  "#3984d6",
  "#8b5cf6",
  "#111111",
  "#ffffff",
];

const ROUND_SECONDS = 60;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function pickWord(previous?: string): Word {
  const available = WORDS.filter(
    (word) => word.value !== previous
  );

  return available[Math.floor(Math.random() * available.length)];
}

export default function DrawingMysteryGame({ onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(
    null
  );

  const [phase, setPhase] = useState<Phase>("ready");
  const [players, setPlayers] = useState(["Joueur 1", "Joueur 2"]);
  const [drawerIndex, setDrawerIndex] = useState(0);
  const [word, setWord] = useState<Word>(() => pickWord());
  const [seconds, setSeconds] = useState(ROUND_SECONDS);
  const [color, setColor] = useState("#49353d");
  const [brushSize, setBrushSize] = useState(5);
  const [isEraser, setIsEraser] = useState(false);
  const [guess, setGuess] = useState("");
  const [message, setMessage] = useState("");
  const [scores, setScores] = useState([0, 0]);
  const [round, setRound] = useState(1);
  const [guessCount, setGuessCount] = useState(0);

  const drawer = players[drawerIndex];
  const guesser = players[1 - drawerIndex];

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = window.devicePixelRatio || 1;
    const previous = document.createElement("canvas");
    previous.width = canvas.width;
    previous.height = canvas.height;

    if (canvas.width && canvas.height) {
      previous.getContext("2d")?.drawImage(canvas, 0, 0);
    }

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (previous.width && previous.height) {
      ctx.drawImage(
        previous,
        0,
        0,
        previous.width,
        previous.height,
        0,
        0,
        rect.width,
        rect.height
      );
    }
  }, []);

  useEffect(() => {
    resizeCanvas();

    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  useEffect(() => {
    if (phase !== "playing") return;

    const timer = window.setTimeout(() => {
      if (seconds <= 1) {
        setSeconds(0);
        setPhase("revealed");
        setMessage("Le temps est écoulé !");
      } else {
        setSeconds((current) => current - 1);
      }
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [phase, seconds]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }, []);

  function startRound(nextDrawerIndex = drawerIndex, previousWord?: string) {
    setDrawerIndex(nextDrawerIndex);
    setWord(pickWord(previousWord));
    setSeconds(ROUND_SECONDS);
    setGuess("");
    setMessage("");
    setGuessCount(0);
    setColor("#49353d");
    setBrushSize(5);
    setIsEraser(false);
    clearCanvas();
    setPhase("playing");
  }

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function handlePointerDown(
    event: React.PointerEvent<HTMLCanvasElement>
  ) {
    if (phase !== "playing") return;

    // Le dessinateur uniquement peut dessiner.
    drawingRef.current = true;
    lastPointRef.current = getPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);

    const ctx = canvasRef.current?.getContext("2d");
    const point = lastPointRef.current;

    if (!ctx || !point) return;

    ctx.beginPath();
    ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = isEraser ? "#ffffff" : color;
    ctx.fill();
  }

  function handlePointerMove(
    event: React.PointerEvent<HTMLCanvasElement>
  ) {
    if (!drawingRef.current || phase !== "playing") return;

    const ctx = canvasRef.current?.getContext("2d");
    const point = getPoint(event);
    const previous = lastPointRef.current;

    if (!ctx || !previous) return;

    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(point.x, point.y);
    ctx.strokeStyle = isEraser ? "#ffffff" : color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    lastPointRef.current = point;
  }

  function stopDrawing() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function submitGuess(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (phase !== "playing" || !guess.trim()) return;

    setGuessCount((current) => current + 1);

    if (normalize(guess) === normalize(word.value)) {
      setScores((current) =>
        current.map((score, index) =>
          index === 1 - drawerIndex ? score + 1 : score
        )
      );
      setMessage(`Bravo ${guesser} ! Tu as trouvé le mot.`);
      setPhase("revealed");
      setSeconds(0);
      return;
    }

    setMessage("Pas encore ! Essaie une autre réponse.");
    setGuess("");
  }

  function resetGame() {
    setScores([0, 0]);
    setRound(1);
    setDrawerIndex(0);
    setWord(pickWord());
    setSeconds(ROUND_SECONDS);
    setGuess("");
    setGuessCount(0);
    setMessage("");
    clearCanvas();
    setPhase("ready");
  }

  const progress = (seconds / ROUND_SECONDS) * 100;

  return (
    <main className="min-h-screen bg-[#fff9f7] px-4 py-5 text-[#49353d] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 flex items-center justify-between gap-4">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm text-[#977781] transition hover:text-[#49353d]"
          >
            <ArrowLeft size={17} />
            Tous les jeux
          </button>

          <span className="text-2xl font-semibold tracking-tight">
            oycea<span className="text-[#d58ba2]">.</span>
          </span>
        </header>

        <section className="mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#f1dce2] bg-white px-3 py-2 text-xs tracking-wide text-[#ad7187]">
              <Sparkles size={14} />
              UN JEU À DEUX
            </span>

            <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">
              Dessin{" "}
              <span className="font-serif italic text-[#cc819a]">
                Mystère
              </span>
            </h1>

            <p className="mt-3 max-w-lg text-sm leading-6 text-[#907b82] sm:text-base">
              Un mot secret, un crayon et 60 secondes.
              Sauras-tu faire deviner ton mot préféré ?
            </p>
          </div>

          <button
            onClick={resetGame}
            className="inline-flex items-center justify-center gap-2 self-start rounded-full border border-[#eedde1] bg-white px-4 py-2.5 text-sm transition hover:bg-[#fff0f4] sm:self-auto"
          >
            <RotateCcw size={15} />
            Recommencer
          </button>
        </section>

        <section className="mb-5 grid grid-cols-2 gap-3">
          {players.map((player, index) => (
            <div
              key={index}
              className={`rounded-2xl border p-4 transition ${
                phase !== "ready" && drawerIndex === index
                  ? "border-[#d9a0b1] bg-[#fff0f4]"
                  : "border-[#f0dfe3] bg-white"
              }`}
            >
              <div className="flex items-center gap-2 text-xs text-[#907b82]">
                {drawerIndex === index && phase !== "ready" ? (
                  <Pencil size={14} />
                ) : (
                  <Users size={14} />
                )}
                {drawerIndex === index && phase !== "ready"
                  ? "Dessine"
                  : "Devine"}
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <input
                  aria-label={`Nom du joueur ${index + 1}`}
                  value={player}
                  maxLength={20}
                  onChange={(event) =>
                    setPlayers((current) =>
                      current.map((name, i) =>
                        i === index ? event.target.value : name
                      )
                    )
                  }
                  disabled={phase === "playing"}
                  className="min-w-0 w-full bg-transparent text-sm font-medium outline-none disabled:opacity-80 sm:text-base"
                />

                <span className="flex shrink-0 items-center gap-1 font-semibold text-[#c98298]">
                  <Trophy size={14} />
                  {scores[index]}
                </span>
              </div>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-3xl border border-[#f0dfe3] bg-white shadow-[0_18px_60px_rgba(125,76,91,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f3e8ea] px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff0f4] text-[#c98298]">
                <Palette size={19} />
              </div>
              <div>
                <p className="text-sm font-medium">
                  Manche {round}
                </p>
                <p className="mt-1 text-xs text-[#907b82]">
                  {phase === "ready"
                    ? "Prêts à jouer ?"
                    : phase === "playing"
                      ? `${drawer || "Joueur 1"} dessine`
                      : "Fin de la manche"}
                </p>
              </div>
            </div>

            <div
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
                seconds <= 10 && phase === "playing"
                  ? "bg-red-50 text-red-600"
                  : "bg-[#fff9f7] text-[#49353d]"
              }`}
            >
              <Clock3 size={16} />
              {String(Math.floor(seconds / 60)).padStart(2, "0")}:
              {String(seconds % 60).padStart(2, "0")}
            </div>
          </div>

          <div className="px-4 pt-5 sm:px-6">
            {phase === "playing" && (
              <div className="mb-5 rounded-2xl bg-[#fff9f7] p-4">
                <p className="text-xs tracking-wide text-[#a78b93]">
                  {drawer}, dessine ce mot sans l&apos;écrire !
                </p>
                <p className="mt-2 text-xl font-semibold text-[#c98298]">
                  {word.value}
                </p>
                <p className="mt-1 text-xs text-[#907b82]">
                  Catégorie : {word.category}
                </p>
              </div>
            )}

            {phase === "ready" && (
              <div className="mb-5 rounded-2xl bg-[#fff9f7] p-4">
                <p className="text-sm font-medium">
                  Comment jouer ?
                </p>
                <p className="mt-2 text-sm leading-6 text-[#907b82]">
                  {drawer} reçoit un mot secret et le dessine.
                  {` ${guesser}`} doit le deviner en moins de 60 secondes.
                  Un point est attribué à la bonne réponse, puis les rôles
                  s&apos;inversent.
                </p>
              </div>
            )}

            <div className="relative overflow-hidden rounded-2xl border border-[#eee1e4] bg-white">
              <canvas
                ref={canvasRef}
                className={`block h-[300px] w-full select-none sm:h-[390px] ${
                  phase === "playing"
                    ? "cursor-crosshair"
                    : "cursor-default"
                }`}
                style={{ touchAction: "none" }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopDrawing}
                onPointerCancel={stopDrawing}
                onLostPointerCapture={stopDrawing}
              />

              {phase === "ready" && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-white/90 px-5 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#fff0f4] text-[#c98298]">
                    <Pencil size={28} />
                  </div>
                  <p className="mt-4 text-lg font-medium">
                    À vos crayons
                  </p>
                  <p className="mt-2 max-w-xs text-sm leading-6 text-[#907b82]">
                    Le mot secret apparaîtra au lancement de la manche.
                  </p>
                </div>
              )}

              {phase === "revealed" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 px-5 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#fff0f4] text-[#c98298]">
                    <Heart size={25} />
                  </div>
                  <p className="mt-4 text-sm text-[#907b82]">
                    Le mot était
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    {word.value}
                  </p>
                  <p className="mt-2 text-sm text-[#907b82]">
                    {message || "Belle tentative !"}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {COLORS.map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      setColor(item);
                      setIsEraser(false);
                    }}
                    disabled={phase !== "playing"}
                    aria-label={`Choisir la couleur ${item}`}
                    aria-pressed={color === item && !isEraser}
                    className={`h-8 w-8 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      color === item && !isEraser
                        ? "scale-110 ring-2 ring-[#c98298] ring-offset-2"
                        : "border-black/10"
                    }`}
                    style={{ backgroundColor: item }}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEraser(false)}
                  disabled={phase !== "playing"}
                  aria-label="Crayon"
                  className={`rounded-xl border p-2.5 disabled:opacity-40 ${
                    !isEraser
                      ? "border-[#c98298] bg-[#fff0f4] text-[#c98298]"
                      : "border-[#eedde1] text-[#907b82]"
                  }`}
                >
                  <Pencil size={17} />
                </button>

                <button
                  onClick={() => setIsEraser(true)}
                  disabled={phase !== "playing"}
                  aria-label="Gomme"
                  className={`rounded-xl border p-2.5 disabled:opacity-40 ${
                    isEraser
                      ? "border-[#c98298] bg-[#fff0f4] text-[#c98298]"
                      : "border-[#eedde1] text-[#907b82]"
                  }`}
                >
                  <Eraser size={17} />
                </button>

                <button
                  onClick={clearCanvas}
                  disabled={phase !== "playing"}
                  aria-label="Effacer le dessin"
                  className="rounded-xl border border-[#eedde1] p-2.5 text-[#907b82] disabled:opacity-40"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            <div className="mb-5 mt-4">
              <div className="flex items-center justify-between text-xs text-[#907b82]">
                <label htmlFor="brush-size">Épaisseur du trait</label>
                <span>{brushSize}px</span>
              </div>
              <input
                id="brush-size"
                type="range"
                min={2}
                max={18}
                value={brushSize}
                disabled={phase !== "playing"}
                onChange={(event) =>
                  setBrushSize(Number(event.target.value))
                }
                className="mt-2 w-full accent-[#c98298] disabled:opacity-40"
              />
            </div>
          </div>

          <div className="border-t border-[#f3e8ea] bg-[#fffdfc] p-4 sm:p-6">
            {phase === "ready" && (
              <button
                onClick={() => startRound()}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#b87188]"
              >
                <Sparkles size={17} />
                Commencer la partie
              </button>
            )}

            {phase === "playing" && (
              <form onSubmit={submitGuess}>
                <label
                  htmlFor="drawing-guess"
                  className="text-sm font-medium"
                >
                  {guesser}, que représente le dessin ?
                </label>

                <div className="mt-3 flex gap-2">
                  <input
                    id="drawing-guess"
                    value={guess}
                    onChange={(event) => setGuess(event.target.value)}
                    placeholder="Ta réponse..."
                    maxLength={100}
                    className="min-w-0 flex-1 rounded-full border border-[#eedde1] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#c98298]"
                  />
                  <button
                    type="submit"
                    disabled={!guess.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#b87188] disabled:opacity-50"
                  >
                    <Check size={16} />
                    Deviner
                  </button>
                </div>

                {message && (
                  <p
                    role="status"
                    className="mt-3 text-sm text-[#ad7187]"
                  >
                    {message}
                  </p>
                )}

                <p className="mt-3 text-xs text-[#a78b93]">
                  {guessCount} tentative{guessCount > 1 ? "s" : ""}
                </p>
              </form>
            )}

            {phase === "revealed" && (
              <div>
                <div className="mb-4 rounded-2xl bg-[#fff0f4] p-4">
                  <p className="text-sm font-medium">
                    Manche terminée
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[#907b82]">
                    {scores[0] === scores[1]
                      ? "Vous êtes à égalité. À vous de vous départager !"
                      : `${scores[0] > scores[1] ? players[0] : players[1]} mène la partie.`}
                  </p>
                </div>

                <button
                  onClick={() => {
                    setRound((current) => current + 1);
                    startRound(1 - drawerIndex, word.value);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#b87188]"
                >
                  <RotateCcw size={16} />
                  Manche suivante
                </button>
              </div>
            )}
          </div>
        </section>

        <footer className="mt-8 flex items-center justify-center gap-2 text-xs text-[#b29aa1]">
          <Heart size={12} />
          Un petit monde, rien qu&apos;à nous · Oycea
        </footer>
      </div>
    </main>
  );
}
