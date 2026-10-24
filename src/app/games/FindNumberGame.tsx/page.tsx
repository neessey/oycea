/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Copy,
  Hash,
  LoaderCircle,
  RotateCcw,
  Users,
} from "lucide-react";
import { useOyceaOnlineGame } from "@/lib/oycea/UseOyceaOnlineGame";

type Guess = {
  player: number;
  guess: string;
  exact: number;
  misplaced: number;
  absent: number;
};

export default function FindNumberGame({
  onBack,
}: {
  onBack: () => void;
}) {
  const {
    userId,
    game,
    roomCode,
    setRoomCode,
    busy,
    error,
    player,
    createGame,
    joinGame,
    setFindNumberSecret,
    submitFindNumberGuess,
  } = useOyceaOnlineGame("findnumber");

  const [guess, setGuess] = useState("");
  const [secret, setSecret] = useState("");
  const [secretSubmitted, setSecretSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");

  const guesses = (game?.game_state?.guesses ?? []) as Guess[];
  const currentTurn = Number(game?.game_state?.turn ?? 1);
  const readyCount = Number(game?.game_state?.ready_count ?? 0);
  const bothReady = readyCount >= 2;
  const finished = game?.status === "finished";

  useEffect(() => {
    if (!game) return;

    if (game.status === "waiting") {
      setNotice("En attente du deuxième joueur…");
    } else if (finished) {
      setNotice("La partie est terminée.");
    } else if (!bothReady) {
      setNotice("Chaque joueur doit enregistrer son code secret.");
    } else {
      setNotice(
        currentTurn === player
          ? "À toi de jouer."
          : "C'est au tour de ton partenaire."
      );
    }
  }, [game, finished, bothReady, currentTurn, player]);

  async function copyCode() {
    if (!game?.room_code) return;

    try {
      await navigator.clipboard.writeText(game.room_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setNotice("Copie impossible. Note le code de la salle.");
    }
  }

  async function submitSecret(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!game || busy || secretSubmitted || finished) return;

    if (game.status !== "playing") {
      setNotice("Attends que ton partenaire rejoigne la salle.");
      return;
    }

    if (!/^\d{4}$/.test(secret)) {
      setNotice("Choisis exactement 4 chiffres.");
      return;
    }

    const success = await setFindNumberSecret(secret);

    if (success) {
      setSecretSubmitted(true);
      setSecret("");
      setNotice(
        "Ton code secret est enregistré. Attends ton partenaire."
      );
    }
  }

  async function submitGuess(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!game || !player || busy || finished || !bothReady) return;

    if (currentTurn !== player) {
      setNotice("Ce n'est pas encore ton tour.");
      return;
    }

    if (!/^\d{4}$/.test(guess)) {
      setNotice("Entre exactement 4 chiffres.");
      return;
    }

    const success = await submitFindNumberGuess(guess);

    if (success) {
      setGuess("");
      setNotice("Proposition envoyée.");
    }
  }

  if (!userId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fff9f7] text-[#49353d]">
        <LoaderCircle
          className="animate-spin text-[#c98298]"
          size={28}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fff9f7] px-5 py-8 text-[#49353d] sm:px-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex items-center justify-between">
          <button
            type="button"
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

        <section className="rounded-[2rem] border border-[#f0dfe3] bg-white p-6 shadow-[0_18px_60px_rgba(125,76,91,0.06)] sm:p-9">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0f4] text-[#c98298]">
            <Hash size={28} />
          </div>

          <p className="mt-6 text-xs font-medium tracking-[0.2em] text-[#b78394]">
            JEU DE DÉDUCTION
          </p>

          <h1 className="mt-2 text-3xl font-medium sm:text-4xl">
            Find the Number
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#907b82]">
            Choisissez chacun un code secret de 4 chiffres.
            À tour de rôle, essayez de découvrir celui de
            votre partenaire grâce aux indices.
          </p>

          {error && (
            <p
              role="alert"
              className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          {!game ? (
            <div className="mt-8 space-y-5">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void createGame({
                    turn: 1,
                    guesses: [],
                    ready_count: 0,
                  })
                }
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-4 text-sm font-medium text-white transition hover:bg-[#b87188] disabled:opacity-50"
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" size={17} />
                ) : (
                  <Users size={17} />
                )}
                Créer une salle
              </button>

              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-[#f0dfe3]" />
                <span className="text-xs text-[#b29aa1]">OU</span>
                <div className="h-px flex-1 bg-[#f0dfe3]" />
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void joinGame();
                }}
                className="space-y-3"
              >
                <label className="block text-sm font-medium">
                  Rejoindre une salle
                </label>

                <input
                  value={roomCode}
                  onChange={(event) =>
                    setRoomCode(event.target.value.toUpperCase())
                  }
                  maxLength={6}
                  placeholder="Entre le code"
                  className="w-full rounded-2xl border border-[#eedde1] bg-[#fffafa] px-4 py-4 text-center text-lg uppercase tracking-[0.25em] outline-none focus:border-[#c98298]"
                />

                <button
                  type="submit"
                  disabled={busy || roomCode.trim().length === 0}
                  className="w-full rounded-full border border-[#e9d1d8] px-5 py-4 text-sm font-medium text-[#ad7187] transition hover:bg-[#fff2f5] disabled:opacity-50"
                >
                  {busy ? "Connexion…" : "Rejoindre la partie"}
                </button>
              </form>
            </div>
          ) : (
            <>
              <div className="mt-7 rounded-2xl bg-[#fff9f7] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-[#a78b93]">
                      CODE DE LA SALLE
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-[0.2em]">
                      {game.room_code}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm text-[#ad7187]"
                  >
                    <Copy size={15} />
                    {copied ? "Copié" : "Copier"}
                  </button>
                </div>

                <p className="mt-4 flex items-center gap-2 text-sm text-[#907b82]">
                  <Users size={16} />
                  {game.guest_id
                    ? "Les deux joueurs sont dans la salle."
                    : "Envoie le code à ton partenaire."}
                </p>
              </div>

              <div className="mt-6 rounded-2xl border border-[#f0dfe3] p-5">
                <p className="text-sm text-[#907b82]">
                  État de la partie
                </p>

                <h2 className="mt-2 text-xl font-medium">
                  {game.status === "waiting"
                    ? "En attente du partenaire"
                    : finished
                      ? "Partie terminée"
                      : !bothReady
                        ? "Préparation des codes secrets"
                        : currentTurn === player
                          ? "À toi de jouer"
                          : "Au tour de ton partenaire"}
                </h2>

                <p className="mt-2 text-sm leading-6 text-[#907b82]">
                  {notice}
                </p>
              </div>

              {game.status === "playing" &&
                !finished &&
                !bothReady &&
                !secretSubmitted && (
                  <form
                    onSubmit={submitSecret}
                    className="mt-6 rounded-2xl bg-[#fff9f7] p-5"
                  >
                    <label className="mb-2 block text-sm font-medium">
                      Choisis ton code secret
                    </label>

                    <p className="mb-4 text-sm text-[#907b82]">
                      Saisis 4 chiffres. Ton code restera secret
                      pour ton partenaire.
                    </p>

                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={4}
                      value={secret}
                      onChange={(event) =>
                        setSecret(
                          event.target.value
                            .replace(/\D/g, "")
                            .slice(0, 4)
                        )
                      }
                      placeholder="4 chiffres"
                      className="w-full rounded-2xl border border-[#eedde1] bg-white px-4 py-4 text-center text-lg tracking-[0.4em] outline-none focus:border-[#c98298]"
                    />

                    <button
                      type="submit"
                      disabled={busy || secret.length !== 4}
                      className="mt-3 w-full rounded-full bg-[#c98298] px-5 py-4 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {busy ? (
                        <LoaderCircle
                          className="mx-auto animate-spin"
                          size={18}
                        />
                      ) : (
                        "Valider mon code secret"
                      )}
                    </button>
                  </form>
                )}

              {game.status === "playing" &&
                !bothReady &&
                secretSubmitted && (
                  <p className="mt-5 rounded-2xl bg-[#fff9f7] p-4 text-sm text-[#907b82]">
                    Ton code secret est enregistré. En attente
                    du deuxième joueur…
                  </p>
                )}

              {game.status === "playing" &&
                !finished &&
                bothReady && (
                  <form onSubmit={submitGuess} className="mt-6">
                    <label className="mb-2 block text-sm font-medium">
                      Ta proposition
                    </label>

                    <p className="mb-3 text-sm text-[#907b82]">
                      Bien placés : chiffres corrects à la bonne
                      position. Mal placés : chiffres présents
                      à une autre position.
                    </p>

                    <div className="flex gap-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={guess}
                        onChange={(event) =>
                          setGuess(
                            event.target.value
                              .replace(/\D/g, "")
                              .slice(0, 4)
                          )
                        }
                        placeholder="4 chiffres"
                        disabled={busy || currentTurn !== player}
                        className="min-w-0 flex-1 rounded-2xl border border-[#eedde1] bg-[#fffafa] px-4 py-4 outline-none focus:border-[#c98298] disabled:opacity-50"
                      />

                      <button
                        type="submit"
                        disabled={
                          busy ||
                          currentTurn !== player ||
                          !/^\d{4}$/.test(guess)
                        }
                        className="rounded-2xl bg-[#c98298] px-5 py-4 text-sm font-medium text-white transition hover:bg-[#b87188] disabled:opacity-50"
                      >
                        {busy ? (
                          <LoaderCircle
                            className="animate-spin"
                            size={18}
                          />
                        ) : (
                          "Proposer"
                        )}
                      </button>
                    </div>
                  </form>
                )}

              <div className="mt-8">
                <h2 className="font-medium">
                  Historique des propositions
                </h2>

                {guesses.length === 0 ? (
                  <p className="mt-3 rounded-2xl bg-[#fff9f7] p-4 text-sm text-[#907b82]">
                    Aucune proposition pour le moment.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {guesses.map((item, index) => (
                      <div
                        key={`${index}-${item.player}-${item.guess}`}
                        className="rounded-2xl bg-[#fff9f7] px-4 py-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-[#907b82]">
                            Joueur {item.player}
                          </span>

                          <span className="font-semibold tracking-widest">
                            {item.guess}
                          </span>
                        </div>

                        <p className="mt-2 text-sm text-[#907b82]">
                          Bien placés : {item.exact} · Mal placés :{" "}
                          {item.misplaced} · Absents : {item.absent}
                        </p>

                        {item.exact === 4 && (
                          <p className="mt-2 text-sm font-medium text-[#b87188]">
                            Code découvert !
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {finished && (
                <div className="mt-6 rounded-2xl bg-[#fff0f4] p-5 text-center">
                  <h2 className="text-xl font-medium">
                    Partie terminée
                  </h2>
                  <p className="mt-2 text-sm text-[#907b82]">
                    {guesses.length > 0
                      ? `Le joueur ${guesses[guesses.length - 1].player} a trouvé le code !`
                      : "La partie est terminée."}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={onBack}
                className="mt-7 inline-flex items-center gap-2 text-sm text-[#977781] hover:text-[#49353d]"
              >
                <RotateCcw size={15} />
                Retour aux jeux
              </button>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
