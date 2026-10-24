// "use client";

// import { useCallback, useEffect, useMemo, useState } from "react";
// import {
//   ArrowLeft, Copy, Dices, Heart, LoaderCircle, RotateCcw, Users,
// } from "lucide-react";
// import { createClient } from "@/lib/supabase/client";

// type Player = "host" | "guest";
// type GameStatus = "waiting" | "playing" | "finished";

// type LudoState = {
//   tokens: { host: number[]; guest: number[] };
//   turn: Player;
//   dice: number | null;
//   message: string;
//   winner: Player | null;
// };

// type LudoSession = {
//   id: string;
//   room_code: string;
//   host_id: string;
//   guest_id: string | null;
//   status: GameStatus;
//   game_state: LudoState;
// };

// const STORAGE_KEY = "oycea_ludo_session_id";

// // Couleurs personnalisées pour Oycea
// const COLORS: Record<Player, string> = { 
//   host: "#2e7d32", // Vert
//   guest: "#1565c0" // Bleu
// };
// const LIGHT: Record<Player, string> = { 
//   host: "#e8f5e9", 
//   guest: "#e3f2fd" 
// };

// // CONSTANTES DU JEU CLASSIQUE
// const HOME = -1;
// const GOAL = 56;
// const START: Record<Player, number> = { host: 0, guest: 26 };
// const SAFE_CELLS = [0, 8, 13, 21, 26, 34, 39, 47];

// // ---------------------------------------------------------------------------
// // GÉOMÉTRIE DU PLATEAU (Grille 15x15)
// // ---------------------------------------------------------------------------
// const CELL_SIZE = 26.66;
// const BOARD_SIZE = 400;

// function getCellCenter(col: number, row: number) {
//   return {
//     x: col * CELL_SIZE + CELL_SIZE / 2,
//     y: row * CELL_SIZE + CELL_SIZE / 2,
//   };
// }

// // Parcours extérieur (52 cases)
// const PATH_COORDS: { col: number; row: number }[] = [
//   { col: 6, row: 13 }, { col: 6, row: 12 }, { col: 6, row: 11 }, { col: 6, row: 10 }, { col: 6, row: 9 },
//   { col: 5, row: 8 }, { col: 4, row: 8 }, { col: 3, row: 8 }, { col: 2, row: 8 }, { col: 1, row: 8 }, { col: 0, row: 8 },
//   { col: 0, row: 7 }, { col: 0, row: 6 },
//   { col: 1, row: 6 }, { col: 2, row: 6 }, { col: 3, row: 6 }, { col: 4, row: 6 }, { col: 5, row: 6 },
//   { col: 6, row: 5 }, { col: 6, row: 4 }, { col: 6, row: 3 }, { col: 6, row: 2 }, { col: 6, row: 1 }, { col: 6, row: 0 },
//   { col: 7, row: 0 }, { col: 8, row: 0 },
//   { col: 8, row: 1 }, { col: 8, row: 2 }, { col: 8, row: 3 }, { col: 8, row: 4 }, { col: 8, row: 5 },
//   { col: 9, row: 6 }, { col: 10, row: 6 }, { col: 11, row: 6 }, { col: 12, row: 6 }, { col: 13, row: 6 }, { col: 14, row: 6 },
//   { col: 14, row: 7 }, { col: 14, row: 8 },
//   { col: 13, row: 8 }, { col: 12, row: 8 }, { col: 11, row: 8 }, { col: 10, row: 8 }, { col: 9, row: 8 },
//   { col: 8, row: 9 }, { col: 8, row: 10 }, { col: 8, row: 11 }, { col: 8, row: 12 }, { col: 8, row: 13 }, { col: 8, row: 14 },
//   { col: 7, row: 14 }, { col: 6, row: 14 }
// ];

// const PATH = PATH_COORDS.map(c => getCellCenter(c.col, c.row));

// const HOME_SLOTS: Record<Player, { x: number; y: number }[]> = {
//   host: [
//     getCellCenter(1.5, 1.5), getCellCenter(3.5, 1.5),
//     getCellCenter(1.5, 3.5), getCellCenter(3.5, 3.5)
//   ],
//   guest: [
//     getCellCenter(10.5, 10.5), getCellCenter(12.5, 10.5),
//     getCellCenter(10.5, 12.5), getCellCenter(12.5, 12.5)
//   ],
// };

// const LANE_START_IDX: Record<Player, number> = { host: 0, guest: 26 };

// export default function LudoGame({ onBack }: { onBack: () => void }) {
//   const supabase = useMemo(() => createClient(), []);
//   const [userId, setUserId] = useState("");
//   const [session, setSession] = useState<LudoSession | null>(null);
//   const [roomInput, setRoomInput] = useState("");
//   const [loading, setLoading] = useState(true);
//   const [busy, setBusy] = useState(false);
//   const [message, setMessage] = useState("");
//   const [copied, setCopied] = useState(false);
//   const [selectedToken, setSelectedToken] = useState<number | null>(null);

//   // État pour l'animation de déplacement
//   const [animatingToken, setAnimatingToken] = useState<{
//     player: Player;
//     index: number;
//     path: number[];
//   } | null>(null);
//   const [animFrame, setAnimFrame] = useState(0);

//   const refreshSession = useCallback(async (id: string) => {
//     const { data, error } = await supabase
//       .from("oycea_ludo_sessions").select("*").eq("id", id).maybeSingle();
//     if (!error && data) {
//       setSession(data as LudoSession);
//       setSelectedToken(null);
//     }
//   }, [supabase]);

//   useEffect(() => {
//     let active = true;
//     async function init() {
//       const { data, error } = await supabase.auth.getUser();
//       if (error || !data.user) { window.location.href = "/login"; return; }
//       if (!active) return;
//       setUserId(data.user.id);
//       const savedId = sessionStorage.getItem(STORAGE_KEY);
//       if (savedId) {
//         const { data: saved } = await supabase
//           .from("oycea_ludo_sessions").select("*").eq("id", savedId).maybeSingle();
//         if (active && saved && (saved.host_id === data.user.id || saved.guest_id === data.user.id)) {
//           setSession(saved as LudoSession);
//         } else {
//           sessionStorage.removeItem(STORAGE_KEY);
//         }
//       }
//       if (active) setLoading(false);
//     }
//     void init();
//     return () => { active = false; };
//   }, [supabase]);

//   useEffect(() => {
//     if (!session?.id) return;
//     const ch = supabase
//       .channel(`oycea-ludo-${session.id}`)
//       .on("postgres_changes",
//         { event: "*", schema: "public", table: "oycea_ludo_sessions", filter: `id=eq.${session.id}` },
//         () => void refreshSession(session.id))
//       .subscribe();
//     return () => { void supabase.removeChannel(ch); };
//   }, [session?.id, supabase, refreshSession]);

//   async function createRoom() {
//     if (busy) return;
//     setBusy(true); setMessage("");
//     try {
//       const { data, error } = await supabase.rpc("oycea_ludo_create_game");
//       if (error) throw error;
//       const created = data as LudoSession;
//       sessionStorage.setItem(STORAGE_KEY, created.id);
//       setSession(created);
//     } catch (e) {
//       setMessage(e instanceof Error ? e.message : "Création impossible.");
//     } finally { setBusy(false); }
//   }

//   async function joinRoom() {
//     if (roomInput.trim().length !== 6 || busy) return;
//     setBusy(true); setMessage("");
//     try {
//       const { data, error } = await supabase.rpc("oycea_ludo_join_game", {
//         p_room_code: roomInput.trim().toUpperCase(),
//       });
//       if (error) throw error;
//       const joined = data as LudoSession;
//       sessionStorage.setItem(STORAGE_KEY, joined.id);
//       setSession(joined); setRoomInput("");
//     } catch (e) {
//       setMessage(e instanceof Error ? e.message : "Impossible de rejoindre.");
//     } finally { setBusy(false); }
//   }

//  async function performAction(action: "roll" | "move", tokenIndex: number | null = null) {
//   if (!session || busy) return;

//   // --- ANIMATION DE DÉPLACEMENT ---
//   if (action === "move" && tokenIndex !== null && session.game_state) {
//     const state = session.game_state;
//     const player = isHost ? "host" : "guest";
//     const oldProgress = state.tokens[player][tokenIndex];
//     const diceValue = state.dice;
//     if (diceValue === null) return;

//     let newProgress: number;
//     if (oldProgress === HOME) {
//       newProgress = 0;
//     } else {
//       newProgress = Math.min(oldProgress + diceValue, GOAL);
//     }

//     const startProg = oldProgress === HOME ? 0 : oldProgress;
//     const path = oldProgress === HOME
//       ? [0]
//       : Array.from({ length: newProgress - startProg + 1 }, (_, i) => startProg + i);

//     // On bloque l'interface et on démarre l'animation
//     setBusy(true);
//     setSelectedToken(null);
//     setAnimatingToken({ player, index: tokenIndex, path });

//     // Animation case par case
//     for (let i = 0; i < path.length; i++) {
//       setAnimFrame(i);
//       await new Promise((r) => setTimeout(r, 200));
//     }

//     // À ce stade, le pion est visuellement à la dernière case de `path`.
//     // On va envoyer la requête Supabase MAINTENANT, mais on garde l'animation
//     // active avec la dernière frame pour éviter le "saut en arrière".

//     try {
//       const { data, error } = await supabase.rpc("oycea_ludo_action", {
//         p_room_code: session.room_code,
//         p_action: action,
//         p_token_index: tokenIndex,
//       });
//       if (error) throw error;

//       // Mise à jour de la session
//       setSession(data as LudoSession);
      
//       // On désactive l'animation SEULEMENT une fois la session mise à jour
//       // Le pion va "rester" sur la dernière position grâce au displayProgress
//       // qui reprendra la bonne valeur depuis la session fraîchement reçue.
//       setAnimatingToken(null);
//     } catch (e) {
//       setMessage(e instanceof Error ? e.message : "Action impossible.");
//       setAnimatingToken(null); // En cas d'erreur, on désactive quand même
//     } finally {
//       setBusy(false);
//     }
//     return;
//   }

//   // --- LANCER DE DÉ (action normale) ---
//   setBusy(true); setMessage("");
//   try {
//     const { data, error } = await supabase.rpc("oycea_ludo_action", {
//       p_room_code: session.room_code,
//       p_action: action,
//       p_token_index: tokenIndex,
//     });
//     if (error) throw error;
//     setSession(data as LudoSession);
//     setSelectedToken(null);
//   } catch (e) {
//     setMessage(e instanceof Error ? e.message : "Action impossible.");
//   } finally { setBusy(false); }
// }

//   async function copyCode() {
//     if (!session) return;
//     try {
//       await navigator.clipboard.writeText(session.room_code);
//       setCopied(true);
//       setTimeout(() => setCopied(false), 1500);
//     } catch { setMessage("Copie impossible."); }
//   }

//   function leaveRoom() {
//     sessionStorage.removeItem(STORAGE_KEY);
//     setSession(null); setSelectedToken(null); setMessage("");
//   }

//   if (loading) {
//     return (
//       <main className="flex min-h-screen items-center justify-center bg-[#fff9f7]">
//         <LoaderCircle className="animate-spin text-[#c98298]" size={28} />
//       </main>
//     );
//   }

//   const isHost = session?.host_id === userId;
//   const myPlayer: Player = isHost ? "host" : "guest";
//   const state = session?.game_state;
//   const myTurn = Boolean(session?.status === "playing" && state?.turn === myPlayer);
//   const tokens = state?.tokens;
//   const myTokens = tokens?.[myPlayer] ?? [];
//   const dice = state?.dice ?? null;

//   const canMove = (index: number) => {
//     if (!myTurn || dice === null) return false;
//     const p = myTokens[index];
//     if (p === GOAL) return false;
//     if (p === HOME) return dice === 6;
//     return p + dice <= GOAL;
//   };

//   const anyMovePossible = myTokens.some((_, i) => canMove(i));

//   function tokenCoord(player: Player, progress: number): { x: number; y: number } {
//     if (progress === HOME) return HOME_SLOTS[player][0];
    
//     if (progress >= 51) {
//       const entryIdx = (LANE_START_IDX[player] + 51) % 52;
//       const entry = PATH[entryIdx];
//       const step = progress - 50;
//       return {
//         x: entry.x + (200 - entry.x) * (step / 6),
//         y: entry.y + (200 - entry.y) * (step / 6),
//       };
//     }
//     return PATH[(START[player] + progress) % 52];
//   }

//   const reachableCell = (() => {
//     if (selectedToken === null || dice === null) return null;
//     const p = myTokens[selectedToken];
//     if (!canMove(selectedToken)) return null;
//     const np = p === HOME ? 0 : p + dice;
//     return tokenCoord(myPlayer, np);
//   })();

//   return (
//     <main className="min-h-screen bg-[#fff9f7] px-4 py-6 text-[#49353d] sm:px-8 sm:py-8">
//       <div className="mx-auto max-w-4xl">
//         <button onClick={session ? leaveRoom : onBack}
//           className="mb-6 inline-flex items-center gap-2 text-sm text-[#977781]">
//           <ArrowLeft size={17} /> Retour aux jeux
//         </button>

//         <header className="mb-7">
//           <div className="flex items-center gap-2 text-[#c98298]">
//             <Heart size={20} />
//             <span className="text-xs font-semibold tracking-[0.2em]">OYCEA · JEU À DEUX</span>
//           </div>
//           <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Ludo</h1>
//           <p className="mt-3 max-w-xl text-sm leading-6 text-[#907b82]">
//             Lance le dé. Un <b>6</b> sort un pion. Atteins le centre avec tes 4 pions.
//             Tombe sur un pion adverse pour le renvoyer à la maison (sauf cases ★).
//           </p>
//         </header>

//         {message && (
//           <p role="status" className="mb-5 rounded-xl bg-white p-3 text-sm text-[#a34d68]">{message}</p>
//         )}

//         {!session ? (
//           <div className="grid gap-5 sm:grid-cols-2">
//             <section className="rounded-3xl border border-[#f0dfe3] bg-white p-6">
//               <Heart size={25} className="text-[#c98298]" />
//               <h2 className="mt-4 text-xl font-medium">Créer une salle</h2>
//               <p className="mt-2 text-sm leading-6 text-[#907b82]">
//                 Crée ta partie et envoie le code à ton partenaire.
//               </p>
//               <button onClick={() => void createRoom()} disabled={busy}
//                 className="mt-5 w-full rounded-full bg-[#c98298] px-5 py-3 text-sm text-white disabled:opacity-60">
//                 {busy ? "Création…" : "Créer ma salle"}
//               </button>
//             </section>

//             <section className="rounded-3xl border border-[#f0dfe3] bg-white p-6">
//               <Users size={25} className="text-[#8170c8]" />
//               <h2 className="mt-4 text-xl font-medium">Rejoindre une salle</h2>
//               <form onSubmit={(e) => { e.preventDefault(); void joinRoom(); }} className="mt-5 space-y-3">
//                 <input value={roomInput}
//                   onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
//                   maxLength={6} placeholder="CODE À 6 LETTRES"
//                   className="w-full rounded-full border border-[#eedde1] bg-[#fffafa] px-4 py-3 text-center uppercase tracking-[0.2em] outline-none focus:border-[#c98298]" />
//                 <button disabled={busy || roomInput.trim().length !== 6}
//                   className="w-full rounded-full border border-[#e9d1d8] px-5 py-3 text-sm text-[#ad7187] disabled:opacity-50">
//                   Rejoindre
//                 </button>
//               </form>
//             </section>
//           </div>
//         ) : (
//           <>
//             <section className="mb-5 rounded-2xl border border-[#f0dfe3] bg-white p-4">
//               <div className="flex flex-wrap items-center justify-between gap-3">
//                 <div>
//                   <p className="text-xs text-[#a78b93]">CODE DE LA SALLE</p>
//                   <p className="mt-1 text-2xl font-bold tracking-[0.2em]">{session.room_code}</p>
//                 </div>
//                 <button onClick={() => void copyCode()}
//                   className="inline-flex items-center gap-2 rounded-full bg-[#fff2f5] px-4 py-2 text-sm text-[#ad7187]">
//                   <Copy size={15} /> {copied ? "Copié !" : "Copier le code"}
//                 </button>
//               </div>
//               <p className="mt-3 flex items-center gap-2 text-sm text-[#907b82]">
//                 <Users size={16} />
//                 {session.status === "waiting" ? "En attente du deuxième joueur…"
//                   : session.status === "finished" ? "Partie terminée."
//                   : myTurn ? "C'est ton tour !" : "C'est au tour de ton partenaire."}
//               </p>
//             </section>

//             {session.status === "waiting" ? (
//               <section className="rounded-3xl border border-[#f0dfe3] bg-white p-8 text-center">
//                 <h2 className="mt-5 text-xl font-medium">La partie va bientôt commencer</h2>
//                 <p className="mt-2 text-sm leading-6 text-[#907b82]">
//                   Ouvre Oycea sur un autre appareil et rejoins avec le code.
//                 </p>
//               </section>
//             ) : (
//               <>
//                 <section className="rounded-3xl border border-[#f0dfe3] bg-white p-3 sm:p-6">
//                   <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
//                     <div className="flex items-center gap-2 text-sm">
//                       <span className="h-3 w-3 rounded-full" style={{ background: COLORS.host }} />
//                       <span>Vert : {state?.tokens.host.filter((n) => n === GOAL).length}/4</span>
//                     </div>
//                     <div className="flex items-center gap-2 text-sm">
//                       <span className="h-3 w-3 rounded-full" style={{ background: COLORS.guest }} />
//                       <span>Bleu : {state?.tokens.guest.filter((n) => n === GOAL).length}/4</span>
//                     </div>
//                   </div>

//                   <div className="mx-auto max-w-[440px]">
//                     <svg viewBox="0 0 400 400" className="h-auto w-full rounded-3xl bg-white border border-[#eee]"
//                       role="img" aria-label="Plateau de Ludo">
                      
//                       {/* 1. FOND DU PLATEAU */}
//                       <rect x="0" y="0" width="160" height="160" fill={LIGHT.host} />
//                       <rect x="240" y="240" width="160" height="160" fill={LIGHT.guest} />
//                       <rect x="240" y="0" width="160" height="160" fill="#fef08a" opacity="0.4" />
//                       <rect x="0" y="240" width="160" height="160" fill="#fca5a5" opacity="0.4" />

//                       {/* 2. CASES */}
//                       {Array.from({ length: 15 }).map((_, row) =>
//                         Array.from({ length: 15 }).map((_, col) => {
//                           const isPath = PATH_COORDS.some(p => p.col === col && p.row === row);
//                           const isCenter = (col >= 6 && col <= 8) && (row >= 6 && row <= 8);
//                           if (isPath && !isCenter) {
//                             return (
//                               <rect key={`${col}-${row}`} x={col * CELL_SIZE} y={row * CELL_SIZE}
//                                 width={CELL_SIZE} height={CELL_SIZE}
//                                 fill="white" stroke="#333" strokeWidth="1" />
//                             );
//                           }
//                           return null;
//                         })
//                       )}

//                       {/* 3. MAISONS */}
//                       <rect x="30" y="30" width="100" height="100" rx="15" fill="white" />
//                       {HOME_SLOTS.host.map((pos, i) => (
//                         <circle key={`h-${i}`} cx={pos.x} cy={pos.y} r="10" fill={LIGHT.host} stroke={COLORS.host} strokeWidth="2" />
//                       ))}
//                       <rect x="270" y="270" width="100" height="100" rx="15" fill="white" />
//                       {HOME_SLOTS.guest.map((pos, i) => (
//                         <circle key={`g-${i}`} cx={pos.x} cy={pos.y} r="10" fill={LIGHT.guest} stroke={COLORS.guest} strokeWidth="2" />
//                       ))}

//                       {/* 4. COULOIRS */}
//                       {Array.from({ length: 5 }).map((_, i) => (
//                         <rect key={`lane-h-${i}`} 
//                           x={6 * CELL_SIZE} y={(13 - i) * CELL_SIZE} 
//                           width={CELL_SIZE} height={CELL_SIZE} 
//                           fill={COLORS.host} stroke="#333" strokeWidth="1" />
//                       ))}
//                       {Array.from({ length: 5 }).map((_, i) => (
//                         <rect key={`lane-g-${i}`} 
//                           x={8 * CELL_SIZE} y={(1 + i) * CELL_SIZE} 
//                           width={CELL_SIZE} height={CELL_SIZE} 
//                           fill={COLORS.guest} stroke="#333" strokeWidth="1" />
//                       ))}

//                       {/* 5. CENTRE */}
//                       <polygon points="160,160 240,160 200,200" fill="#fef08a" />
//                       <polygon points="240,160 240,240 200,200" fill="#93c5fd" />
//                       <polygon points="240,240 160,240 200,200" fill="#fca5a5" />
//                       <polygon points="160,240 160,160 200,200" fill="#86efac" />
//                       <circle cx="200" cy="200" r="15" fill="white" stroke="#333" strokeWidth="1" />
//                       <text x="200" y="207" textAnchor="middle" fontSize="18">❤️</text>

//                       {/* 6. FLÈCHES ET ÉTOILES */}
//                       {[8, 21, 34, 47, 0, 13, 26, 39].map(idx => {
//                         const pt = PATH[idx];
//                         return <text key={`star-${idx}`} x={pt.x} y={pt.y + 4} textAnchor="middle" fontSize="14" fill="#9d7d42">★</text>
//                       })}
//                       <text x={PATH[0].x} y={PATH[0].y + 4} textAnchor="middle" fontSize="14" fill={COLORS.host}>↓</text>
//                       <text x={PATH[26].x} y={PATH[26].y + 4} textAnchor="middle" fontSize="14" fill={COLORS.guest}>↑</text>

//                       {/* 7. PIONS (avec animation) */}
//                       {(["host", "guest"] as Player[]).map((player) =>
//                         state?.tokens[player].map((progress, index) => {
//                           // --- ANIMATION : override la position ---
//                           let displayProgress = progress;
//                           if (animatingToken && animatingToken.player === player && animatingToken.index === index) {
//                             displayProgress = animatingToken.path[animFrame] ?? progress;
//                           }

//                           // Empilement si plusieurs pions sur la même case
//                           const sameCell = state.tokens[player]
//                             .map((p, i) => ({ p, i }))
//                             .filter(({ p }) => p !== HOME && p === displayProgress);
//                           const stackIdx = sameCell.findIndex(({ i }) => i === index);
//                           const offset = sameCell.length > 1
//                             ? { x: (stackIdx - (sameCell.length - 1) / 2) * 7, y: 0 }
//                             : { x: 0, y: 0 };

//                           let point: { x: number; y: number };
//                           if (displayProgress === HOME) {
//                             point = HOME_SLOTS[player][index];
//                           } else {
//                             const base = tokenCoord(player, displayProgress);
//                             point = { x: base.x + offset.x, y: base.y + offset.y };
//                           }

//                           const selectable = player === myPlayer && canMove(index);
//                           const isSelected = selectedToken === index && player === myPlayer;
//                           const isGoal = displayProgress === GOAL;

//                           return (
//                             <g key={`${player}-${index}`}
//                               onClick={() => { if (selectable) setSelectedToken(index); }}
//                               style={{ cursor: selectable ? "pointer" : "default" }}>
//                               {isSelected && (
//                                 <circle cx={point.x} cy={point.y} r="14" fill="none"
//                                   stroke="#49353d" strokeWidth="2" strokeDasharray="3 3" />
//                               )}
//                               <circle cx={point.x} cy={point.y}
//                                 r={isGoal ? 10 : 8}
//                                 fill={COLORS[player]}
//                                 stroke={selectable ? "#49353d" : "#ffffff"}
//                                 strokeWidth={selectable ? 3 : 2} />
//                               <text x={point.x} y={point.y + 3} textAnchor="middle"
//                                 fontSize="8" fontWeight="bold" fill="white">
//                                 {index + 1}
//                               </text>
//                             </g>
//                           );
//                         })
//                       )}
//                     </svg>
//                   </div>

//                   <div className="mt-5 rounded-2xl bg-[#fff9f7] p-4 text-center">
//                     <div className="text-sm text-[#907b82]">{state?.message}</div>

//                     {session.status === "playing" && (
//                       <>
//                         {/* ZONE DÉ : AFFICHAGE PERMANENT */}
//                         <div className="my-4 flex items-center justify-center gap-3">
//                           <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#f0dfe3] bg-white text-2xl font-bold">
//                             {dice !== null ? dice : "–"}
//                           </div>
//                           {myTurn && dice === null && (
//                             <button onClick={() => void performAction("roll")} disabled={busy}
//                               className="inline-flex items-center gap-2 rounded-full bg-[#c98298] px-5 py-3 text-sm font-medium text-white disabled:opacity-50">
//                               {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Dices size={17} />}
//                               Lancer le dé
//                             </button>
//                           )}
//                         </div>

//                         {/* CHOIX DU PION */}
//                         {myTurn && dice !== null && (
//                           <div>
//                             <p className="mb-3 text-sm font-medium">
//                               {anyMovePossible ? "Choisis un pion à déplacer" : "Aucun coup possible"}
//                             </p>
//                             <div className="flex flex-wrap justify-center gap-2">
//                               {myTokens.map((progress, index) => {
//                                 const move = canMove(index);
//                                 return (
//                                   <button key={index}
//                                     disabled={!move || busy}
//                                     onClick={() => {
//                                       setSelectedToken(index);
//                                       void performAction("move", index);
//                                     }}
//                                     className="rounded-xl border px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-35"
//                                     style={{
//                                       borderColor: selectedToken === index ? COLORS[myPlayer] : "#eedde1",
//                                       background: selectedToken === index ? "#fff0f4" : "white",
//                                     }}>
//                                     Pion {index + 1}
//                                     <span className="ml-2 text-xs">
//                                       {progress === HOME ? "🏠" : progress === GOAL ? "🏆" : `${progress}/56`}
//                                     </span>
//                                   </button>
//                                 );
//                               })}
//                             </div>
//                           </div>
//                         )}

//                         {!myTurn && (
//                           <p className="text-xs text-[#a78b93]">Attends le lancer de ton partenaire.</p>
//                         )}
//                       </>
//                     )}

//                     {session.status === "finished" && (
//                       <button onClick={leaveRoom}
//                         className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#c98298] px-5 py-3 text-sm text-white">
//                         <RotateCcw size={16} /> Nouvelle partie
//                       </button>
//                     )}
//                   </div>
//                 </section>

//                 <p className="mt-4 text-center text-xs leading-5 text-[#a78b93]">
//                   Un 6 sort un pion et permet de rejouer. Une capture renvoie le pion
//                   adverse à sa maison. Les étoiles ★ sont des cases protégées.
//                   Les règles sont validées côté Supabase.
//                 </p>
//               </>
//             )}
//           </>
//         )}

//         <footer className="mt-10 text-center text-xs text-[#b29aa1]">
//           <Heart size={12} className="mr-1 inline" /> Un petit monde, rien qu&apos;à nous · Oycea
//         </footer>
//       </div>
//     </main>
//   );
// }

"use client";

import { ArrowLeft, Construction, Heart } from "lucide-react";

export default function LudoGame({ onBack }: { onBack: () => void }) {
  return (
    <main className="min-h-screen bg-[#fff9f7] px-4 py-6 text-[#49353d] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <button
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 text-sm text-[#977781]"
        >
          <ArrowLeft size={17} /> Retour aux jeux
        </button>

        <header className="mb-7">
          <div className="flex items-center gap-2 text-[#c98298]">
            <Heart size={20} />
            <span className="text-xs font-semibold tracking-[0.2em]">
              OYCEA · JEU À DEUX
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Ludo 
          </h1>
        </header>

        <section className="rounded-3xl border border-[#f0dfe3] bg-white p-8 text-center shadow-[0_18px_60px_rgba(125,76,91,0.05)] sm:p-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#fff0f4] text-[#c98298]">
            <Construction size={28} />
          </div>

          <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#f1dce2] bg-white px-4 py-2 text-xs tracking-wide text-[#ad7187]">
            EN COURS DE DÉVELOPPEMENT
          </span>

          <h2 className="mt-5 text-2xl font-medium leading-tight">
            Le Ludo arrive
            <br />
            <span className="font-serif italic text-[#cc819a]">
              très bientôt.
            </span>
          </h2>

          <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[#907b82]">
            On peaufine encore le plateau pour que vos parties soient
            parfaites. Reviens vite pour lancer le dé avec ton partenaire.
          </p>

          <button
            onClick={onBack}
            className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-[#c98298] px-6 py-3.5 text-sm font-medium text-white transition hover:bg-[#b87188]"
          >
            Retour aux jeux
          </button>
        </section>

        <footer className="mt-10 text-center text-xs text-[#b29aa1]">
          <Heart size={12} className="mr-1 inline" />
          Un petit monde, rien qu&apos;à nous · Oycea
        </footer>
      </div>
    </main>
  );
}