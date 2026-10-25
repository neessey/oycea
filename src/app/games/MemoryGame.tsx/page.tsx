"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft, BookOpen, Banana, Camera, Cat, Check, Clock3, Dog,
  Flower2, Gift, Rabbit, Star, Trophy, Users, X, Apple, Car, Bird,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Props = { onBack: () => void };
type PublicCard = { index: number; symbol: string };
type MemoryState = {
  turn?: number;
  flipped?: PublicCard[];
  matched_cards?: PublicCard[];
  scores?: Record<string, number>;
  moves?: number;
  lock_until?: number | null;
};
type Game = {
  id: string;
  room_code: string;
  game_type: string;
  host_id: string;
  guest_id: string | null;
  status: "waiting" | "playing" | "finished";
  game_state: MemoryState;
};

const SYMBOLS: Record<string, typeof Cat> = {
  Cat, Dog, Rabbit, Bird, Apple, Banana, Flower2, Star, Car, BookOpen, Gift, Camera,
};

function parseGame(data: unknown): Game | null {
  if (!data || typeof data !== "object") return null;
  const candidate = data as { game?: Game } & Partial<Game>;
  const game = candidate.game ?? candidate;
  return game.id && game.room_code ? (game as Game) : null;
}

export default function MemoryGame({ onBack }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [game, setGame] = useState<Game | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  const state = game?.game_state ?? {};
  const flipped = state.flipped ?? [];
  const matched = state.matched_cards ?? [];
  const scores = state.scores ?? { "1": 0, "2": 0 };
  const turn = Number(state.turn ?? 1);
  const player = game ? (game.host_id === userId ? 1 : game.guest_id === userId ? 2 : null) : null;
  const myTurn = player !== null && player === turn;
  const matchedByIndex = new Map(matched.map((card) => [card.index, card]));
  const flippedByIndex = new Map(flipped.map((card) => [card.index, card]));
  const lockUntil = Number(state.lock_until ?? 0);

  const refresh = useCallback(async (id: string) => {
    const { data, error: readError } = await supabase
      .from("oycea_game_sessions")
      .select("*")
      .eq("id", id)
      .single();
    if (!readError && data && data.game_type === "memory") setGame(data as Game);
  }, [supabase]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (!active) return;
      if (authError || !data.user) setError("Connecte-toi à Oycea pour jouer.");
      else setUserId(data.user.id);
    });
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    if (!game?.id) return;
    const channel = supabase
      .channel(`oycea-memory-${game.id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "oycea_game_sessions",
        filter: `id=eq.${game.id}`,
      }, () => { void refresh(game.id); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [game?.id, supabase, refresh]);

  // When two unmatched cards are visible, either client can request the server-side turn change.
  useEffect(() => {
    if (!game || game.status !== "playing" || flipped.length !== 2 || !lockUntil) return;
    const delay = Math.max(0, lockUntil * 1000 - Date.now()) + 30;
    const timer = window.setTimeout(async () => {
      const { data, error: rpcError } = await supabase.rpc("oycea_memory_continue_turn", {
        p_session_id: game.id,
      });
      if (rpcError) {
        // Another client may already have changed the turn; refresh to get the latest state.
        await refresh(game.id);
      } else {
        const updated = parseGame(data);
        if (updated) setGame(updated);
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [game?.id, game?.status, flipped.length, lockUntil, supabase, refresh]);

  async function runRpc(name: string, args: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: rpcError } = await supabase.rpc(name, args);
      if (rpcError) throw rpcError;
      const updated = parseGame(data);
      if (updated) {
        setGame(updated);
        setRoomCode(updated.room_code);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Une erreur est survenue.");
      if (game?.id) await refresh(game.id);
    } finally {
      setBusy(false);
    }
  }

  async function createRoom() {
    await runRpc("oycea_memory_create", {});
  }

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roomCode.trim()) return;
    await runRpc("oycea_memory_join", { p_room_code: roomCode.trim().toUpperCase() });
  }

  async function flipCard(index: number) {
    if (!game || !myTurn || game.status !== "playing" || busy || lockUntil) return;
    if (matchedByIndex.has(index) || flippedByIndex.has(index)) return;
    await runRpc("oycea_memory_flip", {
      p_session_id: game.id,
      p_card_index: index,
    });
  }

  async function copyCode() {
    if (!game?.room_code) return;
    try {
      await navigator.clipboard.writeText(game.room_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Copie impossible. Sélectionne le code pour le copier.");
    }
  }

  const visibleCards = useMemo(() => Array.from({ length: 24 }, (_, index) => {
    const found = matchedByIndex.get(index);
    const shown = flippedByIndex.get(index);
    return { index, card: found ?? shown ?? null, matched: !!found, revealed: !!found || !!shown };
  }), [state.matched_cards, state.flipped]);

  const pairCount = matched.length / 2;
  const finished = game?.status === "finished";

  return (
    <main className="min-h-screen bg-[#fff9f7] px-4 py-5 text-[#49353d] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 flex items-center justify-between gap-4">
          <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-[#977781] transition hover:text-[#49353d]">
            <ArrowLeft size={17} /> Tous les jeux
          </button>
          <span className="text-2xl font-semibold tracking-tight">oycea<span className="text-[#d58ba2]">.</span></span>
        </header>

        <section className="mb-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#f1dce2] bg-white px-3 py-2 text-xs tracking-wide text-[#ad7187]">
            <SparklesIcon /> MEMORY À DEUX
          </span>
          <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">Memory <span className="font-serif italic text-[#cc819a]">Classique</span></h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-[#907b82] sm:text-base">24 cartes, 12 paires et une mémoire à toute épreuve. Retrouve les paires avant ton adversaire.</p>
        </section>

        {!game && (
          <section className="rounded-3xl border border-[#f0dfe3] bg-white p-5 shadow-[0_18px_60px_rgba(125,76,91,0.05)] sm:p-8">
            <h2 className="text-xl font-medium">Jouer à deux</h2>
            <p className="mt-2 text-sm leading-6 text-[#907b82]">Crée une salle et partage son code, ou rejoins une partie avec le code reçu.</p>
            <button onClick={createRoom} disabled={!userId || busy} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#b87188] disabled:opacity-50">
              <Users size={17} /> {busy ? "Préparation..." : "Créer une salle"}
            </button>
            <div className="my-5 flex items-center gap-3 text-xs text-[#b29aa1]"><div className="h-px flex-1 bg-[#f0dfe3]" /> OU <div className="h-px flex-1 bg-[#f0dfe3]" /></div>
            <form onSubmit={joinRoom} className="space-y-3">
              <label htmlFor="memory-room" className="block text-sm font-medium">Code de la salle</label>
              <input id="memory-room" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} maxLength={12} required placeholder="Ex. A1B2C3" className="w-full rounded-2xl border border-[#eedde1] bg-[#fffdfc] px-4 py-3.5 text-sm uppercase tracking-[0.2em] outline-none focus:border-[#c98298]" />
              <button type="submit" disabled={!userId || !roomCode.trim() || busy} className="flex w-full items-center justify-center gap-2 rounded-full border border-[#eedde1] px-5 py-3.5 text-sm font-medium transition hover:bg-[#fff0f4] disabled:opacity-50">Rejoindre la salle</button>
            </form>
            {!userId && !error && <p className="mt-4 text-sm text-[#ad7187]">Vérification de ta connexion...</p>}
            {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
          </section>
        )}

        {game && (
          <>
            <section className="mb-5 flex flex-col justify-between gap-4 rounded-2xl border border-[#f0dfe3] bg-white p-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs text-[#907b82]">Code de la salle</p>
                <p className="mt-1 text-xl font-semibold tracking-[0.2em]">{game.room_code}</p>
                <p className="mt-1 text-xs text-[#907b82]">{game.status === "waiting" ? "En attente du deuxième joueur" : game.status === "finished" ? "Partie terminée" : myTurn ? "C'est ton tour" : "Au tour de l'adversaire"}</p>
              </div>
              <button onClick={copyCode} className="inline-flex items-center justify-center gap-2 rounded-full border border-[#eedde1] px-4 py-2.5 text-sm transition hover:bg-[#fff0f4]">{copied ? <Check size={15} /> : <Users size={15} />}{copied ? "Code copié" : "Copier le code"}</button>
            </section>

            {game.status === "waiting" ? (
              <section className="rounded-3xl border border-[#f0dfe3] bg-white p-8 text-center">
                <Users size={30} className="mx-auto text-[#c98298]" />
                <h2 className="mt-4 text-xl font-medium">En attente de ton adversaire</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#907b82]">Envoie le code de la salle à l&apos;autre joueur. Le plateau apparaîtra quand il aura rejoint.</p>
              </section>
            ) : (
              <>
                <section className="mb-5 grid grid-cols-2 gap-3">
                  {[1, 2].map((n) => (
                    <div key={n} className={`rounded-2xl border p-4 ${turn === n && !finished ? "border-[#d9a0b1] bg-[#fff0f4]" : "border-[#f0dfe3] bg-white"}`}>
                      <p className="text-xs text-[#907b82]">{n === player ? "Toi" : n === 1 ? "Joueur 1" : "Joueur 2"}{turn === n && !finished ? " · À toi" : ""}</p>
                      <p className="mt-2 flex items-center gap-2 text-xl font-semibold text-[#c98298]"><Trophy size={17} />{Number(scores[String(n)] ?? 0)} <span className="text-sm font-normal text-[#907b82]">paire(s)</span></p>
                    </div>
                  ))}
                </section>

                <section className="rounded-3xl border border-[#f0dfe3] bg-white p-4 shadow-[0_18px_60px_rgba(125,76,91,0.05)] sm:p-6">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div><h2 className="text-lg font-medium">Retrouve les paires</h2><p className="mt-1 text-xs text-[#907b82]">{pairCount}/12 paires trouvées · {Number(state.moves ?? 0)} essais</p></div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-[#fff0f4] px-3 py-2 text-xs text-[#ad7187]"><Clock3 size={14} />{finished ? "Terminé" : myTurn ? "À ton tour" : "Adversaire"}</span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-3">
                    {visibleCards.map(({ index, card, matched: isMatched, revealed }) => {
                      const Icon = card ? SYMBOLS[card.symbol] : null;
                      return (
                        <button key={index} type="button" onClick={() => void flipCard(index)} disabled={!myTurn || busy || finished || !!lockUntil || isMatched || revealed} aria-label={revealed ? `Carte ${index + 1} révélée` : `Retourner la carte ${index + 1}`} className={`flex aspect-[3/4] min-h-[66px] items-center justify-center rounded-xl border transition duration-75 sm:rounded-2xl ${isMatched ? "border-[#d8b7c1] bg-[#fff0f4] text-[#c98298]" : revealed ? "border-[#ead4db] bg-[#fff9f7] text-[#49353d]" : "border-[#f0dfe3] bg-[#c98298] text-white shadow-sm hover:-translate-y-0.5 hover:bg-[#b87188]"} disabled:cursor-default`}>
                          {revealed && Icon ? <Icon size={25} strokeWidth={1.7} className="sm:h-8 sm:w-8" /> : !revealed ? <span className="text-xl font-semibold">O.</span> : <X size={20} />}
                        </button>
                      );
                    })}
                  </div>

                  {finished && (
                    <div className="mt-5 rounded-2xl bg-[#fff0f4] p-5 text-center">
                      <Trophy size={26} className="mx-auto text-[#c98298]" />
                      <h3 className="mt-3 text-xl font-medium">Partie terminée !</h3>
                      <p className="mt-2 text-sm text-[#907b82]">{Number(scores["1"] ?? 0) === Number(scores["2"] ?? 0) ? "Égalité parfaite !" : Number(scores["1"] ?? 0) > Number(scores["2"] ?? 0) ? "Joueur 1 remporte la partie." : "Joueur 2 remporte la partie."}</p>
                    </div>
                  )}
                  {!finished && !myTurn && <p className="mt-4 text-center text-sm text-[#907b82]">Patiente pendant le tour de ton adversaire.</p>}
                  {notice && <p role="status" className="mt-3 text-sm text-[#ad7187]">{notice}</p>}
                  {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
                </section>
              </>
            )}
          </>
        )}

        <footer className="mt-8 flex items-center justify-center gap-2 text-xs text-[#b29aa1]"><HeartIcon /> Un petit monde, rien qu&apos;à nous · Oycea</footer>
      </div>
    </main>
  );
}

function SparklesIcon() {
  return <Star size={14} />;
}
function HeartIcon() {
  return <Flower2 size={12} />;
}
