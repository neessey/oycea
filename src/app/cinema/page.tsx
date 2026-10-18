
// "use client";

// import { useCallback, useEffect, useMemo, useState } from "react";
// import Link from "next/link";
// import {
//   ArrowLeft,
//   Clapperboard,
//   Copy,
//   ExternalLink,
//   Heart,
//   LoaderCircle,
//   LockKeyhole,
//   Pause,
//   Play,
//   Users,
// } from "lucide-react";
// import { createClient } from "@/lib/supabase/client";

// const DEFAULT_VIDEO =
//   "https://xonaflix.space/movie/l-amour-de-ta-vie#xf-player";

// type CinemaRoom = {
//   id: string;
//   room_code: string;
//   host_id: string;
//   guest_id: string | null;
//   video_url: string;
//   is_playing: boolean;
//   current_time_seconds: number;
// };

// function generateCode() {
//   return Math.random().toString(36).slice(2, 8).toUpperCase();
// }

// function validUrl(value: string) {
//   try {
//     return new URL(value).protocol === "https:";
//   } catch {
//     return false;
//   }
// }

// export default function CinemaPage() {
//   const supabase = useMemo(() => createClient(), []);

//   const [userId, setUserId] = useState("");
//   const [room, setRoom] = useState<CinemaRoom | null>(null);
//   const [codeInput, setCodeInput] = useState("");
//   const [videoInput, setVideoInput] = useState(DEFAULT_VIDEO);
//   const [loading, setLoading] = useState(true);
//   const [busy, setBusy] = useState(false);
//   const [message, setMessage] = useState("");
//   const [copied, setCopied] = useState(false);

//   const loadRoom = useCallback(
//     async (id: string) => {
//       const { data, error } = await supabase
//         .from("oycea_cinema")
//         .select("*")
//         .eq("id", id)
//         .maybeSingle();

//       if (error || !data) {
//         setMessage("Impossible de retrouver cette salle.");
//         return;
//       }

//       setRoom(data as CinemaRoom);
//       setVideoInput(data.video_url || DEFAULT_VIDEO);
//     },
//     [supabase]
//   );

//   useEffect(() => {
//     let active = true;

//     async function initialize() {
//       const { data, error } = await supabase.auth.getUser();

//       if (!active) return;

//       if (error || !data.user) {
//         window.location.href = "/login";
//         return;
//       }

//       setUserId(data.user.id);

//       const savedId = sessionStorage.getItem("oycea_cinema_room");

//       if (savedId) {
//         const { data: savedRoom } = await supabase
//           .from("oycea_cinema")
//           .select("*")
//           .eq("id", savedId)
//           .maybeSingle();

//         if (active && savedRoom) {
//           const current = savedRoom as CinemaRoom;

//           if (
//             current.host_id === data.user.id ||
//             current.guest_id === data.user.id
//           ) {
//             setRoom(current);
//             setVideoInput(current.video_url || DEFAULT_VIDEO);
//           }
//         }
//       }

//       if (active) setLoading(false);
//     }

//     void initialize();

//     return () => {
//       active = false;
//     };
//   }, [supabase]);

//   useEffect(() => {
//     if (!room?.id) return;

//     const channel = supabase
//       .channel(`oycea-cinema-${room.id}`)
//       .on(
//         "postgres_changes",
//         {
//           event: "*",
//           schema: "public",
//           table: "oycea_cinema",
//           filter: `id=eq.${room.id}`,
//         },
//         (payload) => {
//           if (payload.new && "id" in payload.new) {
//             const updated = payload.new as CinemaRoom;
//             setRoom(updated);
//             setVideoInput(updated.video_url || DEFAULT_VIDEO);
//           }
//         }
//       )
//       .subscribe();

//     return () => {
//       void supabase.removeChannel(channel);
//     };
//   }, [room?.id, supabase]);

//   async function createRoom() {
//     if (!userId || busy) return;

//     setBusy(true);
//     setMessage("");

//     try {
//       let created: CinemaRoom | null = null;

//       for (let i = 0; i < 3; i++) {
//         const { data, error } = await supabase
//           .from("oycea_cinema")
//           .insert({
//             room_code: generateCode(),
//             host_id: userId,
//             video_url: DEFAULT_VIDEO,
//             is_playing: false,
//             current_time_seconds: 0,
//           })
//           .select("*")
//           .single();

//         if (!error && data) {
//           created = data as CinemaRoom;
//           break;
//         }

//         if (error?.code !== "23505") {
//           setMessage(error?.message || "Création impossible.");
//           break;
//         }
//       }

//       if (!created) {
//         setMessage((previous) =>
//           previous || "Impossible de créer la salle. Réessaie."
//         );
//         return;
//       }

//       sessionStorage.setItem("oycea_cinema_room", created.id);
//       setRoom(created);
//       setVideoInput(created.video_url);
//     } finally {
//       setBusy(false);
//     }
//   }

//   async function joinRoom() {
//     if (!userId || busy) return;

//     const code = codeInput.trim().toUpperCase();

//     if (!code) {
//       setMessage("Entre le code de la salle.");
//       return;
//     }

//     setBusy(true);
//     setMessage("");

//     try {
//       const { data, error } = await supabase.rpc(
//         "join_oycea_cinema",
//         { p_room_code: code }
//       );

//       if (error) {
//         setMessage(error.message);
//         return;
//       }

//       const joined = Array.isArray(data) ? data[0] : data;

//       if (!joined) {
//         setMessage("Aucune salle trouvée avec ce code.");
//         return;
//       }

//       sessionStorage.setItem("oycea_cinema_room", joined.id);
//       setRoom(joined as CinemaRoom);
//       setVideoInput(joined.video_url || DEFAULT_VIDEO);
//     } finally {
//       setBusy(false);
//     }
//   }

//   async function saveVideo() {
//     if (!room || !validUrl(videoInput.trim()) || busy) {
//       setMessage("Entre une adresse HTTPS valide.");
//       return;
//     }

//     setBusy(true);
//     setMessage("");

//     try {
//       const { data, error } = await supabase
//         .from("oycea_cinema")
//         .update({
//           video_url: videoInput.trim(),
//           is_playing: false,
//           current_time_seconds: 0,
//           updated_at: new Date().toISOString(),
//         })
//         .eq("id", room.id)
//         .select("*")
//         .single();

//       if (error) {
//         setMessage(error.message);
//         return;
//       }

//       setRoom(data as CinemaRoom);
//       setMessage("Le lien du film est partagé avec ton partenaire.");
//     } finally {
//       setBusy(false);
//     }
//   }

//   async function setSessionState(playing: boolean) {
//     if (!room || busy) return;

//     setBusy(true);
//     setMessage("");

//     try {
//       const { data, error } = await supabase
//         .from("oycea_cinema")
//         .update({
//           is_playing: playing,
//           updated_at: new Date().toISOString(),
//         })
//         .eq("id", room.id)
//         .select("*")
//         .single();

//       if (error) {
//         setMessage(error.message);
//         return;
//       }

//       setRoom(data as CinemaRoom);
//     } finally {
//       setBusy(false);
//     }
//   }

//   async function copyCode() {
//     if (!room) return;

//     try {
//       await navigator.clipboard.writeText(room.room_code);
//       setCopied(true);
//       window.setTimeout(() => setCopied(false), 1800);
//     } catch {
//       setMessage("Copie impossible. Note le code affiché.");
//     }
//   }

//   function leaveRoom() {
//     sessionStorage.removeItem("oycea_cinema_room");
//     setRoom(null);
//     setMessage("");
//   }

//   if (loading) {
//     return (
//       <main className="flex min-h-screen items-center justify-center bg-[#fff9f7]">
//         <LoaderCircle className="animate-spin text-[#c98298]" size={28} />
//       </main>
//     );
//   }

//   const isHost = room?.host_id === userId;

//   return (
//     <main className="min-h-screen bg-[#fff9f7] px-5 py-8 text-[#49353d] sm:px-8">
//       <div className="mx-auto max-w-5xl">
//         <header className="mb-10 flex items-center justify-between">
//           <Link
//             href="/"
//             className="inline-flex items-center gap-2 text-sm text-[#977781] hover:text-[#49353d]"
//           >
//             <ArrowLeft size={17} />
//             Retour à notre cocon
//           </Link>

//           <Link href="/" className="text-2xl font-semibold tracking-tight">
//             oycea<span className="text-[#d58ba2]">.</span>
//           </Link>
//         </header>

//         <section className="grid gap-9 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
//           <div>
//             <span className="inline-flex items-center gap-2 rounded-full border border-[#f1dce2] bg-white px-4 py-2 text-xs tracking-wide text-[#ad7187]">
//               <Clapperboard size={14} />
//               MOVIE DATE · 01
//             </span>

//             <h1 className="mt-5 text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
//               Un film,
//               <br />
//               <span className="font-serif italic text-[#cc819a]">
//                 toi et moi.
//               </span>
//             </h1>

//             <p className="mt-5 max-w-md leading-7 text-[#907b82]">
//               Même à des kilomètres, on peut se retrouver pour un rendez-vous
//               cinéma. Prépare les snacks, je m’occupe de l’ambiance.
//             </p>

//             {message && (
//               <p
//                 role="status"
//                 className="mt-5 rounded-xl border border-[#f0d2d9] bg-white px-4 py-3 text-sm text-[#a34d68]"
//               >
//                 {message}
//               </p>
//             )}

//             {!room ? (
//               <div className="mt-8 space-y-6 rounded-3xl border border-[#f1e1e4] bg-white p-6 shadow-[0_18px_60px_rgba(125,76,91,0.06)]">
//                 <div>
//                   <h2 className="font-medium">Notre salle privée</h2>
//                   <p className="mt-1 text-sm text-[#9c858d]">
//                     Crée une salle et partage son code.
//                   </p>

//                   <button
//                     onClick={() => void createRoom()}
//                     disabled={busy}
//                     className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#b87188] disabled:opacity-60"
//                   >
//                     {busy ? (
//                       <LoaderCircle size={17} className="animate-spin" />
//                     ) : (
//                       <Heart size={16} />
//                     )}
//                     Créer notre salle
//                   </button>
//                 </div>

//                 <div className="h-px bg-[#f3e8ea]" />

//                 <form
//                   onSubmit={(event) => {
//                     event.preventDefault();
//                     void joinRoom();
//                   }}
//                 >
//                   <label htmlFor="cinema-code" className="text-sm font-medium">
//                     Rejoindre sa salle
//                   </label>

//                   <div className="mt-3 flex gap-2">
//                     <input
//                       id="cinema-code"
//                       value={codeInput}
//                       onChange={(event) =>
//                         setCodeInput(event.target.value.toUpperCase())
//                       }
//                       maxLength={6}
//                       placeholder="CODE"
//                       className="min-w-0 flex-1 rounded-full border border-[#eedde1] bg-[#fffafa] px-4 py-3 text-sm uppercase outline-none focus:border-[#c98298]"
//                     />
//                     <button
//                       type="submit"
//                       disabled={busy}
//                       className="rounded-full border border-[#e9d1d8] px-5 py-3 text-sm font-medium hover:bg-[#fff2f5] disabled:opacity-60"
//                     >
//                       Rejoindre
//                     </button>
//                   </div>
//                 </form>
//               </div>
//             ) : (
//               <div className="mt-8 rounded-3xl border border-[#f1e1e4] bg-white p-6 shadow-[0_18px_60px_rgba(125,76,91,0.06)]">
//                 <div className="flex items-center justify-between gap-3">
//                   <div>
//                     <p className="text-xs tracking-wide text-[#a78b93]">
//                       CODE DE LA SALLE
//                     </p>
//                     <p className="mt-1 text-2xl font-semibold tracking-[0.2em]">
//                       {room.room_code}
//                     </p>
//                   </div>

//                   <button
//                     onClick={() => void copyCode()}
//                     className="inline-flex items-center gap-2 rounded-full bg-[#fff0f4] px-4 py-2.5 text-sm text-[#ad7187]"
//                   >
//                     <Copy size={15} />
//                     {copied ? "Copié !" : "Copier"}
//                   </button>
//                 </div>

//                 <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#fff9f7] p-4">
//                   <Users size={19} className="text-[#c98298]" />
//                   <div>
//                     <p className="text-sm font-medium">
//                       {room.guest_id ? "Vous êtes deux !" : "En attente de ton partenaire"}
//                     </p>
//                     <p className="mt-1 text-xs text-[#a78b93]">
//                       {room.guest_id
//                         ? "Votre salle est prête."
//                         : "Envoie-lui le code pour qu’il ou elle te rejoigne."}
//                     </p>
//                   </div>
//                 </div>

//                 <button
//                   onClick={leaveRoom}
//                   className="mt-5 text-sm text-[#a78b93] underline underline-offset-4 hover:text-[#49353d]"
//                 >
//                   Quitter cette salle
//                 </button>
//               </div>
//             )}
//           </div>

//           <section className="rounded-[2rem] border border-[#f0dfe3] bg-white p-5 shadow-[0_24px_80px_rgba(125,76,91,0.08)] sm:p-8">
//             <div className="mb-6 flex items-center justify-between">
//               <div>
//                 <p className="text-xs tracking-[0.16em] text-[#b28a97]">
//                   NOTRE PETIT CINÉMA
//                 </p>
//                 <h2 className="mt-2 text-xl font-medium">
//                   Ce soir, on regarde…
//                 </h2>
//               </div>
//               <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff0f4] text-[#c98298]">
//                 <Heart size={21} />
//               </div>
//             </div>

//             {room ? (
//               <>
//                 <div className="rounded-2xl bg-[#fff9f7] p-4">
//                   <label
//                     htmlFor="film-url"
//                     className="text-sm font-medium"
//                   >
//                     Lien du film
//                   </label>

//                   <input
//                     id="film-url"
//                     type="url"
//                     value={videoInput}
//                     onChange={(event) => setVideoInput(event.target.value)}
//                     className="mt-3 w-full rounded-xl border border-[#eedde1] bg-white px-3 py-3 text-sm outline-none focus:border-[#c98298]"
//                     placeholder="https://..."
//                   />

//                   <button
//                     onClick={() => void saveVideo()}
//                     disabled={busy || !validUrl(videoInput.trim())}
//                     className="mt-3 w-full rounded-full border border-[#e9d1d8] px-4 py-3 text-sm font-medium transition hover:bg-[#fff0f4] disabled:opacity-50"
//                   >
//                     Partager ce lien
//                   </button>
//                 </div>

//                 <a
//                   href={room.video_url || DEFAULT_VIDEO}
//                   target="_blank"
//                   rel="noopener noreferrer"
//                   className="mt-5 flex items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#b87188]"
//                 >
//                   <ExternalLink size={16} />
//                   Ouvrir le film sur Xonaflix
//                 </a>

//                 <div className="mt-6 rounded-2xl border border-[#f0e1e5] p-5">
//                   <p className="text-xs tracking-wide text-[#a78b93]">
//                     NOTRE RENDEZ-VOUS
//                   </p>

//                   <div className="mt-3 flex items-center gap-3">
//                     <span
//                       className={`flex h-11 w-11 items-center justify-center rounded-full ${
//                         room.is_playing
//                           ? "bg-[#e8f3e8] text-[#59815c]"
//                           : "bg-[#fff0f4] text-[#c98298]"
//                       }`}
//                     >
//                       {room.is_playing ? <Play size={18} /> : <Pause size={18} />}
//                     </span>

//                     <div>
//                       <p className="font-medium">
//                         {room.is_playing
//                           ? "La séance a commencé"
//                           : "En attente du film"}
//                       </p>
//                       <p className="mt-1 text-xs leading-5 text-[#a78b93]">
//                         {room.is_playing
//                           ? "Ton partenaire voit que la séance a commencé."
//                           : "Mettez-vous d’accord avant de lancer le film."}
//                       </p>
//                     </div>
//                   </div>

//                   <button
//                     onClick={() => void setSessionState(!room.is_playing)}
//                     disabled={busy}
//                     className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-[#e9d1d8] px-4 py-3 text-sm font-medium transition hover:bg-[#fff2f5] disabled:opacity-50"
//                   >
//                     {room.is_playing ? (
//                       <>
//                         <Pause size={16} />
//                         Signaler une pause
//                       </>
//                     ) : (
//                       <>
//                         <Play size={16} />
//                         Annoncer le début du film
//                       </>
//                     )}
//                   </button>

//                   <p className="mt-4 text-xs leading-5 text-[#a78b93]">
//                     Ces commandes synchronisent le statut de votre rendez-vous,
//                     pas le lecteur vidéo externe. Après avoir ouvert le film,
//                     chacun doit utiliser les commandes de Xonaflix.
//                   </p>
//                 </div>

//                 {!room.guest_id && (
//                   <p className="mt-4 text-center text-xs text-[#a78b93]">
//                     La salle apparaîtra comme partagée lorsque ton partenaire
//                     aura rejoint avec le code.
//                   </p>
//                 )}
//               </>
//             ) : (
//               <div className="flex min-h-[340px] flex-col items-center justify-center rounded-3xl bg-[#fff9f7] px-6 text-center">
//                 <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#fceaf0] text-[#c98298]">
//                   <Clapperboard size={27} />
//                 </div>
//                 <h3 className="mt-5 text-lg font-medium">
//                   Notre soirée cinéma
//                 </h3>
//                 <p className="mt-2 max-w-xs text-sm leading-6 text-[#a18a91]">
//                   Créez une salle privée pour partager un film et suivre
//                   ensemble le déroulement de votre rendez-vous.
//                 </p>
//               </div>
//             )}
//           </section>
//         </section>

//         <footer className="mt-12 flex items-center justify-center gap-2 text-xs text-[#b29aa1]">
//           <LockKeyhole size={12} />
//           Un petit monde, rien qu’à nous · Oycea
//         </footer>
//       </div>
//     </main>
//   );
// }

"use client";

import Link from "next/link";
import { ArrowLeft, Clapperboard, LockKeyhole, Sparkles } from "lucide-react";

export default function CinemaPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#fff9f7] px-5 py-8 text-[#49353d] sm:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        <header className="mb-10 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#977781] hover:text-[#49353d]"
          >
            <ArrowLeft size={17} />
            Retour à notre cocon
          </Link>

          <Link href="/" className="text-2xl font-semibold tracking-tight">
            oycea<span className="text-[#d58ba2]">.</span>
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center pb-16">
          <section className="w-full max-w-md rounded-[2rem] border border-[#f0dfe3] bg-white p-8 text-center shadow-[0_24px_80px_rgba(125,76,91,0.08)] sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#fceaf0] text-[#c98298]">
              <Clapperboard size={28} />
            </div>

            <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#f1dce2] bg-white px-4 py-2 text-xs tracking-wide text-[#ad7187]">
              BIENTÔT DISPONIBLE
            </span>

            <h1 className="mt-5 text-3xl font-medium leading-tight tracking-tight">
              Notre petit cinéma
              <br />
              <span className="font-serif italic text-[#cc819a]">
                arrive bientôt.
              </span>
            </h1>

            <p className="mt-4 text-sm leading-6 text-[#907b82]">
              On prépare un endroit rien qu&apos;à nous deux pour regarder un film,
              chacun chez soi, mais ensemble. Reviens très vite.
            </p>

            <Link
              href="/"
              className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#b87188]"
            >
              Retour à notre cocon
            </Link>
          </section>
        </div>

        <footer className="flex items-center justify-center gap-2 pb-2 text-xs text-[#b29aa1]">
          <LockKeyhole size={12} />
          Un petit monde, rien qu&apos;à nous · Oycea
        </footer>
      </div>
    </main>
  );
}