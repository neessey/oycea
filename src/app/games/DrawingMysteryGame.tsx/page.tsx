/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type FormEvent,
} from "react";
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
  Copy,
} from "lucide-react";
import { useOyceaOnlineGame } from "@/lib/oycea/UseOyceaOnlineGame";

type Props = {
  onBack: () => void;
};

type Point = { x: number; y: number };

type Stroke = {
  points: Point[];
  color: string;
  size: number;
  eraser: boolean;
};

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
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9]/g, "");
}

function readStrokes(value: unknown): Stroke[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is Stroke =>
      !!item &&
      typeof item === "object" &&
      Array.isArray((item as Stroke).points) &&
      typeof (item as Stroke).color === "string" &&
      typeof (item as Stroke).size === "number"
  );
}

export default function DrawingMysteryGame({ onBack }: Props) {
  const online = useOyceaOnlineGame("dessinmystere");
  const {
    userId,
    game,
    roomCode,
    setRoomCode,
    busy,
    error,
    setError,
    player,
    createGame,
    joinGame,
    drawingSecret,
    isDrawingMysteryDrawer,
    startDrawingMysteryRound,
    addDrawingMysteryStrokes,
    clearDrawingMysteryStrokes,
    submitDrawingMysteryGuess,
    endDrawingMysteryRound,
  } = online;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const sentPointsRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const endingRoundRef = useRef(false);
  const lastRoundRef = useRef("");
  const canvasSizeRef = useRef({ width: 0, height: 0 });

  const [seconds, setSeconds] = useState(ROUND_SECONDS);
  const [color, setColor] = useState("#49353d");
  const [brushSize, setBrushSize] = useState(5);
  const [isEraser, setIsEraser] = useState(false);
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);

  const state = game?.game_state ?? {};
  const phase = (state.phase ?? "ready") as "ready" | "playing" | "revealed";
  const round = Number(state.round ?? 1);
  const turn = Number(state.turn ?? 1);
  const scores = state.scores ?? { "1": 0, "2": 0 };
  const strokes = readStrokes(state.strokes);
  const guesses = Array.isArray(state.guesses) ? state.guesses : [];

  const drawerId =
    turn === 1 ? game?.host_id : game?.guest_id;

  const drawerName =
    turn === 1 ? "Joueur 1" : "Joueur 2";

  const guesserName =
    turn === 1 ? "Joueur 2" : "Joueur 1";

  const isParticipant =
    !!game && (game.host_id === userId || game.guest_id === userId);

  const isMyTurnToDraw =
    !!game &&
    game.game_type === "dessinmystere" &&
    isDrawingMysteryDrawer;

  const canPlay = game?.status === "playing" && !!game.guest_id;

  const drawStroke = useCallback(
    (ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number) => {
      if (!stroke.points.length) return;

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = stroke.eraser ? "#ffffff" : stroke.color;
      ctx.fillStyle = stroke.eraser ? "#ffffff" : stroke.color;
      ctx.lineWidth = stroke.size;

      const first = stroke.points[0];
      ctx.beginPath();
      ctx.arc(
        first.x * width,
        first.y * height,
        stroke.size / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();

      if (stroke.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(first.x * width, first.y * height);

        for (const point of stroke.points.slice(1)) {
          ctx.lineTo(point.x * width, point.y * height);
        }

        ctx.stroke();
      }

      ctx.restore();
    },
    []
  );

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.round(rect.width * dpr);
    const targetHeight = Math.round(rect.height * dpr);

    if (
      canvas.width !== targetWidth ||
      canvas.height !== targetHeight
    ) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    canvasSizeRef.current = {
      width: rect.width,
      height: rect.height,
    };

    for (const stroke of strokes) {
      drawStroke(ctx, stroke, rect.width, rect.height);
    }

    // Conserve le trait local pendant qu'il est encore envoyé au serveur.
    if (drawingRef.current && activeStrokeRef.current) {
      drawStroke(
        ctx,
        activeStrokeRef.current,
        rect.width,
        rect.height
      );
    }
  }, [drawStroke, strokes]);

  useEffect(() => {
    redrawCanvas();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => redrawCanvas());
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [redrawCanvas]);

  useEffect(() => {
    if (!game?.id || phase !== "playing") {
      setSeconds(ROUND_SECONDS);
      return;
    }

    // Chaque appareil démarre le compte à rebours à l'ouverture de la manche.
    // La fin réelle de la manche est aussi validée côté serveur.
    const key = `${game.id}:${round}:${turn}`;

    if (lastRoundRef.current !== key) {
      lastRoundRef.current = key;
      endingRoundRef.current = false;
      setSeconds(ROUND_SECONDS);
      setGuess("");
      setFeedback("");
      setColor("#49353d");
      setBrushSize(5);
      setIsEraser(false);
    }

    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);

          if (!endingRoundRef.current) {
            endingRoundRef.current = true;
            void endDrawingMysteryRound();
          }

          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [game?.id, phase, round, turn, endDrawingMysteryRound]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas, game?.game_state?.strokes]);

  const enqueueStroke = useCallback(
    (stroke: Stroke) => {
      // Sérialise les envois pour limiter les mises à jour concurrentes.
      queueRef.current = queueRef.current
        .catch(() => undefined)
        .then(async () => {
          await addDrawingMysteryStrokes([stroke]);
        });
    },
    [addDrawingMysteryStrokes]
  );

  const flushPendingPoints = useCallback(
    (all = false) => {
      const stroke = activeStrokeRef.current;
      if (!stroke) return;

      const points = stroke.points;
      const start = sentPointsRef.current;

      if (points.length <= start) return;

      const unsent = points.slice(
        Math.max(0, start - 1),
        points.length
      );

      if (!all && unsent.length < 6) return;

      // Chaque morceau reprend le dernier point envoyé pour raccorder les lignes.
      if (unsent.length > 0) {
        enqueueStroke({
          ...stroke,
          points: unsent,
        });
      }

      sentPointsRef.current = points.length;
    },
    [enqueueStroke]
  );

  function getNormalizedPoint(
    event: PointerEvent<HTMLCanvasElement>
  ): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();

    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }

  function paintSegment(stroke: Stroke, fromIndex: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const points = stroke.points;

    if (!points.length) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.eraser ? "#ffffff" : stroke.color;
    ctx.fillStyle = stroke.eraser ? "#ffffff" : stroke.color;
    ctx.lineWidth = stroke.size;

    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(
        points[0].x * rect.width,
        points[0].y * rect.height,
        stroke.size / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    } else {
      const start = Math.max(0, fromIndex - 1);
      ctx.beginPath();
      ctx.moveTo(
        points[start].x * rect.width,
        points[start].y * rect.height
      );

      for (let i = start + 1; i < points.length; i++) {
        ctx.lineTo(
          points[i].x * rect.width,
          points[i].y * rect.height
        );
      }

      ctx.stroke();
    }

    ctx.restore();
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (phase !== "playing" || !isMyTurnToDraw || busy) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    sentPointsRef.current = 0;

    const stroke: Stroke = {
      points: [getNormalizedPoint(event)],
      color,
      size: brushSize,
      eraser: isEraser,
    };

    activeStrokeRef.current = stroke;
    paintSegment(stroke, 0);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (
      !drawingRef.current ||
      phase !== "playing" ||
      !isMyTurnToDraw
    ) {
      return;
    }

    const stroke = activeStrokeRef.current;
    if (!stroke) return;

    stroke.points.push(getNormalizedPoint(event));
    paintSegment(stroke, stroke.points.length - 1);
    flushPendingPoints(false);
  }

  function stopDrawing() {
    if (!drawingRef.current) return;

    flushPendingPoints(true);
    drawingRef.current = false;
    activeStrokeRef.current = null;
    sentPointsRef.current = 0;
  }

  async function handleCreateRoom() {
    if (creating || joining) return;

    setCreating(true);
    setError("");

    await createGame({
      turn: 1,
      round: 1,
      phase: "ready",
      strokes: [],
      guesses: [],
      scores: { "1": 0, "2": 0 },
      ready_count: 0,
    });

    setCreating(false);
  }

  async function handleJoinRoom() {
    if (joining || creating) return;

    setJoining(true);
    setError("");

    await joinGame();

    setJoining(false);
  }

  async function handleGuess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!guess.trim() || phase !== "playing" || isMyTurnToDraw || busy) {
      return;
    }

    const submittedGuess = guess.trim();
    setGuess("");

    const correct = await submitDrawingMysteryGuess(submittedGuess);

    if (correct === true) {
      setFeedback("Bravo ! Tu as trouvé le mot.");
      setSeconds(0);
      endingRoundRef.current = true;
    } else if (correct === false) {
      setFeedback("Pas encore ! Essaie une autre réponse.");
    }
  }

  async function handleClearCanvas() {
    if (!isMyTurnToDraw || phase !== "playing" || busy) return;

    drawingRef.current = false;
    activeStrokeRef.current = null;
    sentPointsRef.current = 0;

    await clearDrawingMysteryStrokes();
    redrawCanvas();
  }

  async function handleNextRound() {
    if (!canPlay || phase === "playing" || busy) return;

    endingRoundRef.current = false;
    setFeedback("");

    await startDrawingMysteryRound();
  }

  async function handleCopyCode() {
    if (!game?.room_code) return;

    try {
      await navigator.clipboard.writeText(game.room_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copie impossible. Sélectionne le code pour le copier.");
    }
  }

  const myScore = player ? Number(scores[String(player)] ?? 0) : 0;
  const otherPlayer = player === 1 ? 2 : 1;
  const otherScore = player ? Number(scores[String(otherPlayer)] ?? 0) : 0;

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
              MULTIJOUEUR EN LIGNE
            </span>

            <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">
              Dessin{" "}
              <span className="font-serif italic text-[#cc819a]">
                Mystère
              </span>
            </h1>

            <p className="mt-3 max-w-lg text-sm leading-6 text-[#907b82] sm:text-base">
              Un mot secret, un crayon et 60 secondes.
              Dessine, devine et marque des points en ligne.
            </p>
          </div>
        </section>

        {!game && (
          <section className="rounded-3xl border border-[#f0dfe3] bg-white p-5 shadow-[0_18px_60px_rgba(125,76,91,0.05)] sm:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-medium">Jouer à deux</h2>
              <p className="mt-2 text-sm leading-6 text-[#907b82]">
                Crée une salle et partage son code, ou rejoins une salle existante.
                Chaque joueur doit être connecté à son compte Oycea.
              </p>
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={!userId || busy || creating || joining}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#b87188] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Users size={17} />
              {creating ? "Création en cours..." : "Créer une salle"}
            </button>

            <div className="my-5 flex items-center gap-3 text-xs text-[#b29aa1]">
              <div className="h-px flex-1 bg-[#f0dfe3]" />
              OU
              <div className="h-px flex-1 bg-[#f0dfe3]" />
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleJoinRoom();
              }}
              className="space-y-3"
            >
              <label
                htmlFor="room-code"
                className="block text-sm font-medium"
              >
                Code de la salle
              </label>

              <input
                id="room-code"
                value={roomCode}
                onChange={(event) =>
                  setRoomCode(event.target.value.toUpperCase())
                }
                placeholder="Entre le code reçu"
                maxLength={12}
                required
                className="w-full rounded-2xl border border-[#eedde1] bg-[#fffdfc] px-4 py-3.5 text-sm uppercase tracking-[0.2em] outline-none transition focus:border-[#c98298]"
              />

              <button
                type="submit"
                disabled={!userId || !roomCode.trim() || busy || creating || joining}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-[#eedde1] bg-white px-5 py-3.5 text-sm font-medium transition hover:bg-[#fff0f4] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {joining ? "Connexion à la salle..." : "Rejoindre la salle"}
              </button>
            </form>

            {!userId && !error && (
              <p className="mt-4 text-sm text-[#ad7187]">
                Vérification de ta connexion...
              </p>
            )}

            {error && (
              <p role="alert" className="mt-4 text-sm text-red-600">
                {error}
              </p>
            )}
          </section>
        )}

        {game && (
          <>
            <section className="mb-5 grid grid-cols-2 gap-3">
              {[1, 2].map((number) => {
                const isDrawer = turn === number;
                const isMe = player === number;
                const score = Number(scores[String(number)] ?? 0);

                return (
                  <div
                    key={number}
                    className={`rounded-2xl border p-4 transition ${
                      phase !== "ready" && isDrawer
                        ? "border-[#d9a0b1] bg-[#fff0f4]"
                        : "border-[#f0dfe3] bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs text-[#907b82]">
                      {isDrawer && phase === "playing" ? (
                        <Pencil size={14} />
                      ) : (
                        <Users size={14} />
                      )}
                      Joueur {number}{isMe ? " · Toi" : ""}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {phase === "playing"
                          ? isDrawer
                            ? "Dessine"
                            : "Devine"
                          : isDrawer
                            ? "Prochain dessinateur"
                            : "En attente"}
                      </span>

                      <span className="flex items-center gap-1 font-semibold text-[#c98298]">
                        <Trophy size={14} />
                        {score}
                      </span>
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="mb-5 rounded-2xl border border-[#f0dfe3] bg-white p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <div>
                <p className="text-xs text-[#907b82]">Code de la salle</p>
                <p className="mt-1 text-xl font-semibold tracking-[0.2em]">
                  {game.room_code}
                </p>
                <p className="mt-1 text-xs text-[#907b82]">
                  {game.status === "waiting"
                    ? "En attente du deuxième joueur"
                    : "Partie connectée"}
                </p>
              </div>

              <button
                onClick={handleCopyCode}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-full border border-[#eedde1] px-4 py-2.5 text-sm transition hover:bg-[#fff0f4] sm:mt-0"
              >
                <Copy size={15} />
                {copied ? "Code copié" : "Copier le code"}
              </button>
            </section>

            {game.status === "waiting" && (
              <section className="rounded-3xl border border-[#f0dfe3] bg-white p-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#fff0f4] text-[#c98298]">
                  <Users size={27} />
                </div>
                <h2 className="mt-4 text-xl font-medium">
                  En attente de ton adversaire
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#907b82]">
                  Envoie le code de la salle à l&apos;autre joueur.
                  La partie commencera dès qu&apos;il aura rejoint.
                </p>
              </section>
            )}

            {canPlay && (
              <section className="overflow-hidden rounded-3xl border border-[#f0dfe3] bg-white shadow-[0_18px_60px_rgba(125,76,91,0.05)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f3e8ea] px-4 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff0f4] text-[#c98298]">
                      <Palette size={19} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Manche {round}</p>
                      <p className="mt-1 text-xs text-[#907b82]">
                        {phase === "ready"
                          ? "Prêts à jouer ?"
                          : phase === "playing"
                            ? isMyTurnToDraw
                              ? "C'est à toi de dessiner"
                              : "Observe et devine"
                            : "Manche terminée"}
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
                    00:{String(seconds).padStart(2, "0")}
                  </div>
                </div>

                <div className="px-4 pt-5 sm:px-6">
                  {phase === "playing" && isMyTurnToDraw && (
                    <div className="mb-5 rounded-2xl bg-[#fff9f7] p-4">
                      <p className="text-xs tracking-wide text-[#a78b93]">
                        Dessine ce mot sans l&apos;écrire !
                      </p>
                      <p className="mt-2 text-xl font-semibold text-[#c98298]">
                        {drawingSecret ?? "Chargement du mot..."}
                      </p>
                    </div>
                  )}

                  {phase === "playing" && !isMyTurnToDraw && (
                    <div className="mb-5 rounded-2xl bg-[#fff9f7] p-4">
                      <p className="text-sm font-medium">
                        À toi de deviner
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#907b82]">
                        Le mot est secret. Observe le dessin et propose ta réponse.
                      </p>
                    </div>
                  )}

                  {phase === "ready" && (
                    <div className="mb-5 rounded-2xl bg-[#fff9f7] p-4">
                      <p className="text-sm font-medium">Comment jouer ?</p>
                      <p className="mt-2 text-sm leading-6 text-[#907b82]">
                        Le dessinateur reçoit un mot secret. L&apos;autre joueur
                        doit le deviner en 60 secondes. Les rôles changent à
                        chaque manche.
                      </p>
                    </div>
                  )}

                  <div className="relative overflow-hidden rounded-2xl border border-[#eee1e4] bg-white">
                    <canvas
                      ref={canvasRef}
                      className={`block h-[300px] w-full select-none sm:h-[390px] ${
                        phase === "playing" && isMyTurnToDraw
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
                        <p className="mt-4 text-lg font-medium">À vos crayons</p>
                        <p className="mt-2 max-w-xs text-sm leading-6 text-[#907b82]">
                          Lance la manche pour découvrir qui dessine en premier.
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
                          {drawingSecret ?? "Mot révélé"}
                        </p>
                        <p className="mt-2 text-sm text-[#907b82]">
                          {feedback || "Belle tentative !"}
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
                          disabled={phase !== "playing" || !isMyTurnToDraw}
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
                        disabled={phase !== "playing" || !isMyTurnToDraw}
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
                        disabled={phase !== "playing" || !isMyTurnToDraw}
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
                        onClick={handleClearCanvas}
                        disabled={phase !== "playing" || !isMyTurnToDraw || busy}
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
                      disabled={phase !== "playing" || !isMyTurnToDraw}
                      onChange={(event) => setBrushSize(Number(event.target.value))}
                      className="mt-2 w-full accent-[#c98298] disabled:opacity-40"
                    />
                  </div>
                </div>

                <div className="border-t border-[#f3e8ea] bg-[#fffdfc] p-4 sm:p-6">
                  {phase === "ready" && (
                    <button
                      onClick={handleNextRound}
                      disabled={busy}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#b87188] disabled:opacity-50"
                    >
                      <Sparkles size={17} />
                      {busy ? "Préparation..." : "Commencer la partie"}
                    </button>
                  )}

                  {phase === "playing" && !isMyTurnToDraw && (
                    <form onSubmit={handleGuess}>
                      <label htmlFor="drawing-guess" className="text-sm font-medium">
                        Que représente le dessin ?
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
                          disabled={!guess.trim() || busy}
                          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#b87188] disabled:opacity-50"
                        >
                          <Check size={16} />
                          Deviner
                        </button>
                      </div>

                      {feedback && (
                        <p role="status" className="mt-3 text-sm text-[#ad7187]">
                          {feedback}
                        </p>
                      )}

                      <p className="mt-3 text-xs text-[#a78b93]">
                        {guesses.length} tentative{guesses.length > 1 ? "s" : ""}
                      </p>
                    </form>
                  )}

                  {phase === "playing" && isMyTurnToDraw && (
                    <p className="text-center text-sm leading-6 text-[#907b82]">
                      C&apos;est à ton adversaire de deviner. Continue à dessiner sans écrire le mot.
                    </p>
                  )}

                  {phase === "revealed" && (
                    <div>
                      <div className="mb-4 rounded-2xl bg-[#fff0f4] p-4">
                        <p className="text-sm font-medium">Manche terminée</p>
                        <p className="mt-1 text-sm leading-6 text-[#907b82]">
                          {myScore === otherScore
                            ? "Vous êtes à égalité. À vous de vous départager !"
                            : myScore > otherScore
                              ? "Tu mènes la partie."
                              : "Ton adversaire mène la partie."}
                        </p>
                      </div>

                      <button
                        onClick={handleNextRound}
                        disabled={busy}
                        className="flex w-full items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#b87188] disabled:opacity-50"
                      >
                        <RotateCcw size={16} />
                        {busy ? "Préparation..." : "Manche suivante"}
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}

            {error && (
              <p role="alert" className="mt-4 text-sm text-red-600">
                {error}
              </p>
            )}
          </>
        )}

        <footer className="mt-8 flex items-center justify-center gap-2 text-xs text-[#b29aa1]">
          <Heart size={12} />
          Un petit monde, rien qu&apos;à nous · Oycea
        </footer>
      </div>
    </main>
  );
}
