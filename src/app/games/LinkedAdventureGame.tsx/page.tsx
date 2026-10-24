"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Heart, LoaderCircle, Copy, Users, RotateCcw, Trophy,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
type PlayerPos = { x: number; y: number; onGround: boolean };

type GameState = {
  level: number;
  host: PlayerPos;
  guest: PlayerPos;
  status: "playing" | "won" | "lost";
  message: string;
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

// ---------------------------------------------------------------------------
// NIVEAUX
// Coordonnées en cases (grille 12 x 8). Sol = y 7.
// w = largeur de la plateforme (en cases). Si w=1, c'est une case isolée.
// ---------------------------------------------------------------------------
type Platform = { x: number; y: number; w: number; type: "normal" | "spike" | "goal" };

const LEVELS: { name: string; platforms: Platform[]; startHost: number; startGuest: number }[] = [
  {
    name: "Le sentier des cœurs",
    platforms: [
      // Sol
      { x: 0, y: 7, w: 3, type: "normal" },
      { x: 4, y: 7, w: 3, type: "normal" },
      { x: 8, y: 7, w: 4, type: "normal" },
      // Trous : cases 3 et 7
      // Pic sur la case 6
      { x: 6, y: 7, w: 1, type: "spike" },
      // Objectif
      { x: 11, y: 7, w: 1, type: "goal" },
    ],
    startHost: 0,
    startGuest: 1,
  },
  {
    name: "La vallée des pics",
    platforms: [
      { x: 0, y: 7, w: 2, type: "normal" },
      { x: 2, y: 7, w: 1, type: "spike" },
      { x: 3, y: 7, w: 2, type: "normal" },
      { x: 5, y: 7, w: 1, type: "spike" },
      { x: 6, y: 7, w: 3, type: "normal" },
      { x: 9, y: 7, w: 1, type: "spike" },
      { x: 10, y: 7, w: 2, type: "normal" },
      { x: 11, y: 7, w: 1, type: "goal" },
    ],
    startHost: 0,
    startGuest: 0,
  },
  {
    name: "Le grand saut",
    platforms: [
      { x: 0, y: 7, w: 2, type: "normal" },
      // Trou x2, x3
      { x: 4, y: 7, w: 2, type: "normal" },
      // Trou x6
      { x: 7, y: 7, w: 2, type: "normal" },
      // Trou x9
      { x: 10, y: 7, w: 1, type: "normal" },
      { x: 11, y: 7, w: 1, type: "goal" },
      // Petit pic sur la case 5
      { x: 5, y: 7, w: 1, type: "spike" },
    ],
    startHost: 0,
    startGuest: 1,
  },
];

const INITIAL_STATE: GameState = {
  level: 1,
  host: { x: 0, y: 7, onGround: true },
  guest: { x: 1, y: 7, onGround: true },
  status: "playing",
  message: "Avancez jusqu'au cœur ensemble !",
};

// ---------------------------------------------------------------------------
// LOGIQUE DE JEU
// ---------------------------------------------------------------------------
function getPlatformAt(level: number, x: number, y: number): Platform | null {
  const platforms = LEVELS[level - 1].platforms;
  for (const p of platforms) {
    if (x >= p.x && x < p.x + p.w && y === p.y) return p;
  }
  return null;
}

function isHole(level: number, x: number, y: number): boolean {
  return getPlatformAt(level, x, y) === null;
}

function isSpike(level: number, x: number, y: number): boolean {
  const p = getPlatformAt(level, x, y);
  return p?.type === "spike";
}

function isGoal(level: number, x: number, y: number): boolean {
  const p = getPlatformAt(level, x, y);
  return p?.type === "goal";
}

// ---------------------------------------------------------------------------
// COMPOSANT
// ---------------------------------------------------------------------------
export default function LinkedAdventureGame({ onBack }: { onBack: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [session, setSession] = useState<LinkedSession | null>(null);
  const [roomInput, setRoomInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  // État local du jeu
  const [game, setGame] = useState<GameState>(INITIAL_STATE);
  // Animation de saut : true = en l'air (pour CSS)
  const [jumping, setJumping] = useState(false);

  const refreshSession = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("oycea_linked_sessions").select("*").eq("id", id).maybeSingle();
    if (error || !data) return;
    setSession(data as LinkedSession);
    if (data.game_state) setGame(data.game_state);
  }, [supabase]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { window.location.href = "/login"; return; }
      if (!active) return;
      setUserId(data.user.id);
      const savedId = sessionStorage.getItem(SESSION_KEY);
      if (savedId) {
        const { data: saved } = await supabase
          .from("oycea_linked_sessions").select("*").eq("id", savedId).maybeSingle();
        if (active && saved && (saved.host_id === data.user.id || saved.guest_id === data.user.id)) {
          setSession(saved as LinkedSession);
          if (saved.game_state) setGame(saved.game_state);
        } else {
          sessionStorage.removeItem(SESSION_KEY);
        }
      }
      if (active) setLoading(false);
    }
    void initialize();
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    if (!session?.id) return;
    const channel = supabase
      .channel(`oycea-linked-${session.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "oycea_linked_sessions", filter: `id=eq.${session.id}` },
        () => void refreshSession(session.id))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session?.id, supabase, refreshSession]);

  // ---------------------------------------------------------------------------
  // ACTIONS (une par tap, très simple)
  // ---------------------------------------------------------------------------
  
  // Avancer d'une case (les deux personnages ensemble)
  function stepForward() {
    if (game.status !== "playing" || busy) return;
    setBusy(true);
    
    const level = game.level;
    
    // On essaie d'avancer les deux personnages
    const nextHost = { ...game.host, x: game.host.x + 1 };
    const nextGuest = { ...game.guest, x: game.guest.x + 1 };
    
    // Si l'un tombe dans le vide ou touche un pic → perdu
    if (isHole(level, nextHost.x, 7) && !nextHost.onGround) {
      // En fait on est sur le sol, donc on ne "tombe" que si on avance dans le vide
    }
    
    // Vérifier si les deux sont sur une case solide
    const hostSolid = !isHole(level, nextHost.x, 7);
    const guestSolid = !isHole(level, nextGuest.x, 7);
    
    if (hostSolid && guestSolid) {
      // Les deux peuvent avancer
      if (isSpike(level, nextHost.x, 7) || isSpike(level, nextGuest.x, 7)) {
        // Un pic !
        setGame((g) => ({ ...g, status: "lost", message: "Vous avez touché un pic ! 💔" }));
      } else if (isGoal(level, nextHost.x, 7) && isGoal(level, nextGuest.x, 7)) {
        // Les deux sur l'objectif
        setGame((g) => ({ ...g, host: nextHost, guest: nextGuest, status: "won", message: "Vous avez gagné !" }));
      } else {
        setGame((g) => ({ ...g, host: nextHost, guest: nextGuest }));
      }
    } else {
      // Au moins un tombe dans le vide → perdu
      setGame((g) => ({ ...g, host: nextHost, guest: nextGuest, status: "lost", message: "Vous êtes tombés ! 💔" }));
    }
    
    // Animation
    setJumping(true);
    setTimeout(() => setJumping(false), 300);
    setTimeout(() => setBusy(false), 350);
  }
  
  // Sauter (les deux sautent en même temps)
  function jump() {
    if (game.status !== "playing" || busy) return;
    setBusy(true);
    
    const level = game.level;
    const nextHost = { ...game.host, x: game.host.x + 2 };
    const nextGuest = { ...game.guest, x: game.guest.x + 2 };
    
    const hostSolid = !isHole(level, nextHost.x, 7);
    const guestSolid = !isHole(level, nextGuest.x, 7);
    
    if (hostSolid && guestSolid) {
      if (isSpike(level, nextHost.x, 7) || isSpike(level, nextGuest.x, 7)) {
        setGame((g) => ({ ...g, status: "lost", message: "Vous avez atterri sur un pic ! 💔" }));
      } else if (isGoal(level, nextHost.x, 7) && isGoal(level, nextGuest.x, 7)) {
        setGame((g) => ({ ...g, host: nextHost, guest: nextGuest, status: "won", message: "Vous avez gagné !" }));
      } else {
        setGame((g) => ({ ...g, host: nextHost, guest: nextGuest }));
      }
    } else {
      setGame((g) => ({ ...g, host: nextHost, guest: nextGuest, status: "lost", message: "Vous avez sauté dans le vide ! 💔" }));
    }
    
    setJumping(true);
    setTimeout(() => setJumping(false), 400);
    setTimeout(() => setBusy(false), 450);
  }

  async function createRoom() {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const { data, error } = await supabase.rpc("oycea_linked_create_game");
      if (error) throw error;
      const created = data as LinkedSession;
      sessionStorage.setItem(SESSION_KEY, created.id);
      setSession(created);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Impossible de créer la salle.");
    } finally { setBusy(false); }
  }

  async function joinRoom() {
    if (!roomInput.trim() || busy) return;
    setBusy(true); setMessage("");
    try {
      const { data, error } = await supabase.rpc("oycea_linked_join_game", {
        p_room_code: roomInput.trim().toUpperCase(),
      });
      if (error) throw error;
      const joined = data as LinkedSession;
      sessionStorage.setItem(SESSION_KEY, joined.id);
      setSession(joined);
      setRoomInput("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Impossible de rejoindre cette salle.");
    } finally { setBusy(false); }
  }

  async function copyCode() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.room_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { setMessage("Copie impossible."); }
  }

  function leaveRoom() {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
    setGame(INITIAL_STATE);
    setMessage("");
  }

  function restartLevel() {
    const level = LEVELS[game.level - 1];
    setGame({
      level: game.level,
      host: { x: level.startHost, y: 7, onGround: true },
      guest: { x: level.startGuest, y: 7, onGround: true },
      status: "playing",
      message: "Avancez jusqu'au cœur ensemble !",
    });
  }

  function nextLevel() {
    if (game.level >= LEVELS.length) {
      setGame((g) => ({ ...g, status: "won", message: "Aventure terminée ! 🎉" }));
      return;
    }
    const nextLevelNum = game.level + 1;
    const level = LEVELS[nextLevelNum - 1];
    setGame({
      level: nextLevelNum,
      host: { x: level.startHost, y: 7, onGround: true },
      guest: { x: level.startGuest, y: 7, onGround: true },
      status: "playing",
      message: `Niveau ${nextLevelNum} — ${level.name}`,
    });
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fff9f7]">
        <LoaderCircle className="animate-spin text-[#c98298]" size={28} />
      </main>
    );
  }

  const isHost = session?.host_id === userId;
  const myPlayer = isHost ? "host" : "guest";
  const level = LEVELS[game.level - 1];
  
  // Calcul des coordonnées SVG
  const CELL = 30; // taille d'une case en px
  const BOARD_W = 12 * CELL;
  const BOARD_H = 8 * CELL;
  const FLOOR_Y = 7 * CELL + CELL; // bas du sol
  
  function cellToPixel(cx: number, cy: number) {
    return { x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 };
  }

  return (
    <main className="min-h-screen bg-[#fff9f7] px-4 py-6 text-[#49353d] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <button onClick={session ? leaveRoom : onBack}
          className="mb-6 inline-flex items-center gap-2 text-sm text-[#977781]">
          <ArrowLeft size={17} /> Retour aux jeux
        </button>

        <header className="mb-5">
          <div className="flex items-center gap-2 text-[#c98298]">
            <Heart size={20} />
            <span className="text-xs font-semibold tracking-[0.2em]">OYCEA · AVENTURE À DEUX</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Liés pour avancer</h1>
          <p className="mt-2 text-sm leading-6 text-[#907b82]">
            Avancez ensemble jusqu&apos;au cœur. Tape pour avancer ou sauter. Si l&apos;un tombe, c&apos;est perdu !
          </p>
        </header>

        {message && (
          <p role="status" className="mb-4 rounded-xl bg-white p-3 text-sm text-[#a34d68]">{message}</p>
        )}

        {!session ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-3xl border border-[#f0dfe3] bg-white p-5">
              <Heart size={25} className="text-[#c98298]" />
              <h2 className="mt-3 text-lg font-medium">Créer une aventure</h2>
              <p className="mt-2 text-sm text-[#907b82]">Crée ta salle puis envoie le code.</p>
              <button onClick={() => void createRoom()} disabled={busy}
                className="mt-4 w-full rounded-full bg-[#c98298] px-5 py-3 text-sm text-white disabled:opacity-60">
                {busy ? "Création…" : "Créer ma salle"}
              </button>
            </section>
            <section className="rounded-3xl border border-[#f0dfe3] bg-white p-5">
              <Users size={25} className="text-[#9e91c7]" />
              <h2 className="mt-3 text-lg font-medium">Rejoindre</h2>
              <form onSubmit={(e) => { e.preventDefault(); void joinRoom(); }} className="mt-4 space-y-3">
                <input value={roomInput} onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                  maxLength={6} placeholder="CODE À 6 LETTRES"
                  className="w-full rounded-full border border-[#eedde1] bg-[#fffafa] px-4 py-3 text-center uppercase tracking-[0.2em] outline-none focus:border-[#c98298]" />
                <button disabled={busy || roomInput.trim().length < 6}
                  className="w-full rounded-full border border-[#e9d1d8] px-5 py-3 text-sm text-[#ad7187] disabled:opacity-50">
                  Rejoindre
                </button>
              </form>
            </section>
          </div>
        ) : (
          <>
            <section className="mb-4 rounded-2xl border border-[#f0dfe3] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-[#a78b93]">CODE</p>
                  <p className="mt-1 text-xl font-bold tracking-[0.2em]">{session.room_code}</p>
                </div>
                <button onClick={() => void copyCode()}
                  className="inline-flex items-center gap-2 rounded-full bg-[#fff2f5] px-3 py-2 text-xs text-[#ad7187]">
                  <Copy size={13} /> {copied ? "Copié !" : "Copier"}
                </button>
              </div>
              <p className="mt-2 flex items-center gap-2 text-xs text-[#907b82]">
                <Users size={14} />
                {session.status === "waiting" ? "En attente du deuxième joueur…"
                  : session.status === "finished" ? "Aventure terminée !"
                  : `Tu es le personnage ${myPlayer === "host" ? "rose" : "violet"}.`}
              </p>
            </section>

            {session.status === "waiting" && (
              <div className="rounded-3xl border border-[#f0dfe3] bg-white p-8 text-center">
                <h2 className="mt-4 text-lg font-medium">En attente…</h2>
                <p className="mt-2 text-sm text-[#907b82]">
                  Envoie le code à ton partenaire pour commencer.
                </p>
              </div>
            )}

            {session.status !== "waiting" && (
              <>
                {/* NOM DU NIVEAU */}
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs tracking-widest text-[#b28a97]">
                      NIVEAU {game.level} / {LEVELS.length}
                    </p>
                    <h2 className="mt-0.5 text-lg font-medium">{level.name}</h2>
                  </div>
                  {game.status === "won" && <Trophy className="text-yellow-500" size={24} />}
                </div>

                {/* PLATEAU SVG */}
                <div className="relative overflow-hidden rounded-2xl border border-[#f0dfe3] bg-gradient-to-b from-[#c7e9ff] via-[#e0f2fe] to-[#fef9c3]">
                  <svg
                    viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
                    className="block w-full h-auto"
                    style={{ aspectRatio: `${BOARD_W} / ${BOARD_H}` }}
                  >
                    {/* Nuages */}
                    <ellipse cx="60" cy="30" rx="25" ry="10" fill="white" opacity="0.7" />
                    <ellipse cx="80" cy="35" rx="20" ry="8" fill="white" opacity="0.6" />
                    <ellipse cx="250" cy="25" rx="30" ry="12" fill="white" opacity="0.6" />
                    <ellipse cx="300" cy="40" rx="22" ry="9" fill="white" opacity="0.5" />
                    
                    {/* Soleil */}
                    <circle cx="330" cy="30" r="15" fill="#fde68a" opacity="0.8" />
                    
                    {/* Plateformes */}
                    {level.platforms.map((p, i) => {
                      if (p.type === "goal") {
                        return (
                          <g key={i}>
                            {/* Porte / cœur */}
                            <rect
                              x={p.x * CELL + 4}
                              y={p.y * CELL - 10}
                              width={CELL - 8}
                              height={CELL + 10}
                              rx="3"
                              fill="#fef08a"
                              stroke="#b45309"
                              strokeWidth="1.5"
                            />
                            <text
                              x={p.x * CELL + CELL / 2}
                              y={p.y * CELL + 6}
                              textAnchor="middle"
                              fontSize="14"
                            >
                              ❤️
                            </text>
                          </g>
                        );
                      }
                      if (p.type === "spike") {
                        return (
                          <g key={i}>
                            <polygon
                              points={`${p.x * CELL},${p.y * CELL + CELL} ${p.x * CELL + CELL / 2},${p.y * CELL - 2} ${p.x * CELL + CELL},${p.y * CELL + CELL}`}
                              fill="#ef4444"
                              stroke="#991b1b"
                              strokeWidth="1"
                            />
                          </g>
                        );
                      }
                      // Plateforme normale
                      return (
                        <g key={i}>
                          <rect
                            x={p.x * CELL}
                            y={p.y * CELL}
                            width={p.w * CELL}
                            height={CELL}
                            fill="#8b5a2b"
                          />
                          <rect
                            x={p.x * CELL}
                            y={p.y * CELL}
                            width={p.w * CELL}
                            height={4}
                            fill="#a0703f"
                          />
                        </g>
                      );
                    })}
                    
                    {/* Corde entre les personnages */}
                    <line
                      x1={game.host.x * CELL + CELL / 2}
                      y1={game.host.y * CELL + 5}
                      x2={game.guest.x * CELL + CELL / 2}
                      y2={game.guest.y * CELL + 5}
                      stroke="#8b5a2b"
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                    />
                    
                    {/* Personnage HOST (rose) - avec animation de saut CSS */}
                    <g style={{
                      transform: `translate(${game.host.x * CELL + CELL / 2}px, ${game.host.y * CELL + 2 - (jumping ? 8 : 0)}px)`,
                      transition: "transform 0.15s ease-out",
                    }}>
                      {/* Ombre */}
                      <ellipse cx="0" cy="16" rx="8" ry="3" fill="rgba(0,0,0,0.2)" />
                      {/* Corps */}
                      <circle cx="0" cy="0" r="9" fill="#ec4899" stroke="#9d174d" strokeWidth="1.5" />
                      {/* Visage */}
                      <circle cx="-3" cy="-2" r="1.5" fill="white" />
                      <circle cx="3" cy="-2" r="1.5" fill="white" />
                      <circle cx="-3" cy="-2" r="0.7" fill="black" />
                      <circle cx="3" cy="-2" r="0.7" fill="black" />
                      {/* Sourire */}
                      <path d="M -3 3 Q 0 5 3 3" stroke="white" strokeWidth="1" fill="none" />
                    </g>
                    
                    {/* Personnage GUEST (violet) */}
                    <g style={{
                      transform: `translate(${game.guest.x * CELL + CELL / 2}px, ${game.guest.y * CELL + 2 - (jumping ? 8 : 0)}px)`,
                      transition: "transform 0.15s ease-out",
                    }}>
                      <ellipse cx="0" cy="16" rx="8" ry="3" fill="rgba(0,0,0,0.2)" />
                      <circle cx="0" cy="0" r="9" fill="#8b5cf6" stroke="#4c1d95" strokeWidth="1.5" />
                      <circle cx="-3" cy="-2" r="1.5" fill="white" />
                      <circle cx="3" cy="-2" r="1.5" fill="white" />
                      <circle cx="-3" cy="-2" r="0.7" fill="black" />
                      <circle cx="3" cy="-2" r="0.7" fill="black" />
                      <path d="M -3 3 Q 0 5 3 3" stroke="white" strokeWidth="1" fill="none" />
                    </g>
                  </svg>

                  {/* Overlays de fin */}
                  {game.status === "lost" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-500/40 backdrop-blur-sm">
                      <div className="rounded-2xl bg-white p-5 text-center shadow-xl mx-4">
                        <p className="text-4xl">💔</p>
                        <h3 className="mt-2 text-base font-bold text-red-600">Perdu !</h3>
                        <p className="mt-1 text-xs text-gray-600">{game.message}</p>
                        <button onClick={restartLevel}
                          className="mt-3 rounded-full bg-[#c98298] px-5 py-2 text-sm text-white">
                          Réessayer
                        </button>
                      </div>
                    </div>
                  )}
                  {game.status === "won" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-green-500/30 backdrop-blur-sm">
                      <div className="rounded-2xl bg-white p-5 text-center shadow-xl mx-4">
                        <p className="text-4xl">🎉</p>
                        <h3 className="mt-2 text-base font-bold text-green-600">Gagné !</h3>
                        <p className="mt-1 text-xs text-gray-600">{game.message}</p>
                        {game.level < LEVELS.length ? (
                          <button onClick={nextLevel}
                            className="mt-3 rounded-full bg-[#c98298] px-5 py-2 text-sm text-white">
                            Niveau suivant →
                          </button>
                        ) : (
                          <button onClick={leaveRoom}
                            className="mt-3 rounded-full bg-[#c98298] px-5 py-2 text-sm text-white">
                            Nouvelle aventure
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* CONTRÔLES MOBILES */}
                {game.status === "playing" && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      onClick={stepForward}
                      disabled={busy}
                      className="rounded-2xl bg-white border-2 border-[#c98298] py-4 text-base font-semibold text-[#c98298] active:scale-95 transition-transform disabled:opacity-50"
                    >
                      Avancer →
                    </button>
                    <button
                      onClick={jump}
                      disabled={busy}
                      className="rounded-2xl bg-[#c98298] py-4 text-base font-semibold text-white active:scale-95 transition-transform disabled:opacity-50"
                    >
                      Sauter ⤴
                    </button>
                  </div>
                )}

                <p className="mt-3 text-center text-xs leading-5 text-[#a78b93]">
                  Tape sur <b>Avancer</b> pour une case, ou <b>Sauter</b> pour deux.
                  Évite les trous et les pics. Atteignez le ❤️ ensemble.
                </p>
              </>
            )}
          </>
        )}

        <footer className="mt-8 text-center text-xs text-[#b29aa1]">
          <Heart size={12} className="mr-1 inline" /> Un petit monde, rien qu&apos;à nous · Oycea
        </footer>
      </div>
    </main>
  );
}
// "use client";

// import { ArrowLeft, Construction, Heart } from "lucide-react";

// export default function LinkedAdventureGame({
//   onBack,
// }: {
//   onBack: () => void;
// }) {
//   return (
//     <main className="min-h-screen bg-[#fff9f7] px-4 py-6 text-[#49353d] sm:px-8 sm:py-8">
//       <div className="mx-auto max-w-4xl">
//         <button
//           onClick={onBack}
//           className="mb-6 inline-flex items-center gap-2 text-sm text-[#977781]"
//         >
//           <ArrowLeft size={17} /> Retour aux jeux
//         </button>

//         <header className="mb-7">
//           <div className="flex items-center gap-2 text-[#c98298]">
//             <Heart size={20} />
//             <span className="text-xs font-semibold tracking-[0.2em]">
//               OYCEA · AVENTURE À DEUX
//             </span>
//           </div>
//           <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
//             Liés pour avancer
//           </h1>
//         </header>

//         <section className="rounded-3xl border border-[#f0dfe3] bg-white p-8 text-center shadow-[0_18px_60px_rgba(125,76,91,0.05)] sm:p-12">
//           <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#fff0f4] text-[#c98298]">
//             <Construction size={28} />
//           </div>

//           <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#f1dce2] bg-white px-4 py-2 text-xs tracking-wide text-[#ad7187]">
//             EN COURS DE DÉVELOPPEMENT
//           </span>

//           <h2 className="mt-5 text-2xl font-medium leading-tight">
//             L&apos;aventure arrive
//             <br />
//             <span className="font-serif italic text-[#cc819a]">
//               très bientôt.
//             </span>
//           </h2>

//           <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[#907b82]">
//             On construit encore le sentier pour que vos personnages puissent
//             avancer ensemble. Reviens vite pour franchir les obstacles à deux.
//           </p>

//           <button
//             onClick={onBack}
//             className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-[#c98298] px-6 py-3.5 text-sm font-medium text-white transition hover:bg-[#b87188]"
//           >
//             Retour aux jeux
//           </button>
//         </section>

//         <footer className="mt-10 text-center text-xs text-[#b29aa1]">
//           <Heart size={12} className="mr-1 inline" />
//           Un petit monde, rien qu&apos;à nous · Oycea
//         </footer>
//       </div>
//     </main>
//   );
// }
