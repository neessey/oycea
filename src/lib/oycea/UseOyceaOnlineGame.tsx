
/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type GameType =
  | "dames"
  | "bowling"
  | "puzzle"
  | "fourinarow"
  | "findnumber";

export type OnlineGame = {
  id: string;
  room_code: string;
  game_type: GameType;
  host_id: string;
  guest_id: string | null;
  status: "waiting" | "playing" | "finished";
  game_state: Record<string, any>;
};

export function useOyceaOnlineGame(gameType: GameType) {
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState("");
  const [game, setGame] = useState<OnlineGame | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;

      if (error || !data.user) {
        setError("Connecte-toi pour jouer.");
        return;
      }

      setUserId(data.user.id);
    });

    return () => {
      active = false;
    };
  }, [supabase]);

  const refresh = useCallback(
    async (id: string) => {
      const { data, error } = await supabase
        .from("oycea_game_sessions")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) return;

      if (data.game_type === gameType) {
        setGame(data as OnlineGame);
      }
    },
    [supabase, gameType]
  );

  useEffect(() => {
    if (!game?.id) return;

    const channel = supabase
      .channel(`oycea-game-${game.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "oycea_game_sessions",
          filter: `id=eq.${game.id}`,
        },
        () => {
          void refresh(game.id);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [game?.id, supabase, refresh]);

  const createGame = useCallback(
    async (initialState: Record<string, any>) => {
      if (!userId || busy) return;

      setBusy(true);
      setError("");

      try {
        const { data, error } = await supabase.rpc(
          "oycea_create_game",
          {
            p_game_type: gameType,
            p_game_state: initialState,
          }
        );

        if (error) throw error;

        const created = (Array.isArray(data) ? data[0] : data) as
          | OnlineGame
          | null;

        if (!created?.id || created.game_type !== gameType) {
          throw new Error("La salle créée est invalide.");
        }

        setGame(created);
        setRoomCode(created.room_code);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Création impossible."
        );
      } finally {
        setBusy(false);
      }
    },
    [userId, busy, supabase, gameType]
  );

  const joinGame = useCallback(async () => {
    if (!userId || !roomCode.trim() || busy) return;

    setBusy(true);
    setError("");

    try {
      const { data, error } = await supabase.rpc("oycea_join_game", {
        p_room_code: roomCode.trim().toUpperCase(),
        p_game_type: gameType,
      });

      if (error) throw error;

      const joined = (Array.isArray(data) ? data[0] : data) as
        | OnlineGame
        | null;

      if (!joined?.id || joined.game_type !== gameType) {
        throw new Error("Ce code correspond à une autre partie.");
      }

      setGame(joined);
      setRoomCode(joined.room_code);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Impossible de rejoindre."
      );
    } finally {
      setBusy(false);
    }
  }, [userId, roomCode, busy, supabase, gameType]);

  const updateGame = useCallback(
    async (
      nextState: Record<string, any>,
      status: "playing" | "finished" = "playing"
    ) => {
      if (!game || busy) return false;

      setBusy(true);
      setError("");

      try {
        const { data, error } = await supabase.rpc("oycea_update_game", {
          p_session_id: game.id,
          p_game_state: nextState,
          p_status: status,
        });

        if (error) throw error;

        const updated = (Array.isArray(data) ? data[0] : data) as
          | OnlineGame
          | null;

        if (!updated?.id) {
          throw new Error("La mise à jour n'a retourné aucune partie.");
        }

        setGame(updated);
        return true;
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Action impossible."
        );
        await refresh(game.id);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [game, busy, supabase, refresh]
  );

    const setFindNumberSecret = useCallback(
    async (secret: string) => {
      if (!game || busy || gameType !== "findnumber") return false;

      setBusy(true);
      setError("");

      try {
        const { error } = await supabase.rpc(
          "oycea_findnumber_set_secret",
          {
            p_session_id: game.id,
            p_secret: secret,
          }
        );

        if (error) throw error;

        await refresh(game.id);
        return true;
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Impossible d'enregistrer le nombre secret."
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [game, busy, gameType, supabase, refresh]
  );

  const submitFindNumberGuess = useCallback(
    async (guess: string) => {
      if (!game || busy || gameType !== "findnumber") return false;

      setBusy(true);
      setError("");

      try {
        const { data, error } = await supabase.rpc(
          "oycea_findnumber_guess",
          {
            p_session_id: game.id,
            p_guess: guess,
          }
        );

        if (error) throw error;

        const result = data as {
          game?: OnlineGame;
        } | null;

        if (!result?.game?.id) {
          throw new Error("La proposition n'a pas été enregistrée.");
        }

        setGame(result.game);
        return true;
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Impossible d'envoyer la proposition."
        );
        await refresh(game.id);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [game, busy, gameType, supabase, refresh]
  );

  const player =
    game?.host_id === userId
      ? 1
      : game?.guest_id === userId
        ? 2
        : null;

 
  return {
    userId,
    game,
    setGame,
    roomCode,
    setRoomCode,
    busy,
    error,
    setError,
    player,
    createGame,
    joinGame,
    updateGame,
    setFindNumberSecret,
    submitFindNumberGuess,
  };
}



