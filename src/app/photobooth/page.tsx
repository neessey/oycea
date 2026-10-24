/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/refs */

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  Copy,
  Download,
  Heart,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Video,
  VideoOff,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Shot = {
  index: number;
  local?: string;
  remote?: string;
};

type SignalMessage = {
  type: "join" | "offer" | "answer" | "candidate" | "capture";
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  at?: number;
  index?: number;
};

const TOTAL_SHOTS = 4;

const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
};

function PhotoboothContent() {
  const searchParams = useSearchParams();


  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const photosRef = useRef<Shot[]>([]);
  const shotCounterRef = useRef(0);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [isHost, setIsHost] = useState<boolean | null>(null);
  const [localStreamReady, setLocalStreamReady] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Créez une cabine ou rejoignez votre partenaire.");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [copied, setCopied] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">(
    "user"
  );

  const supabase = createClient();

  const updateShots = useCallback(
    (index: number, side: "local" | "remote", image: string) => {
      setShots((previous) => {
        const next = [...previous];
        const existing = next.findIndex((shot) => shot.index === index);

        if (existing >= 0) {
          next[existing] = { ...next[existing], [side]: image };
        } else {
          next.push({ index, [side]: image });
        }

        next.sort((a, b) => a.index - b.index);
        photosRef.current = next;
        return next;
      });
    },
    []
  );

  const sendSignal = useCallback(
    async (message: SignalMessage) => {
      const channel = channelRef.current;
      if (!channel) return;

      await channel.send({
        type: "broadcast",
        event: "signal",
        payload: message,
      });
    },
    []
  );

  const capturePhoto = useCallback(
    (index: number) => {
      const video = localVideoRef.current;

      if (
        !video ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth === 0
      ) {
        setError("La caméra n'est pas encore prête. Réessaie dans un instant.");
        return;
      }

      const canvas = document.createElement("canvas");
      const width = 640;
      const height = Math.round(
        (video.videoHeight / video.videoWidth) * width
      );

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) return;

      context.save();

      if (facingMode === "user") {
        context.translate(width, 0);
        context.scale(-1, 1);
      }

      context.drawImage(video, 0, 0, width, height);
      context.restore();

      const image = canvas.toDataURL("image/jpeg", 0.65);

      updateShots(index, "local", image);

      const dataChannel = dataChannelRef.current;

      if (dataChannel?.readyState === "open") {
        try {
          dataChannel.send(
            JSON.stringify({
              type: "photo",
              index,
              image,
            })
          );
        } catch {
          setError(
            "La photo a été prise, mais son partage a échoué. Vérifiez la connexion."
          );
        }
      }
    },
    [facingMode, updateShots]
  );

  const scheduleCapture = useCallback(
    (at: number, index: number) => {
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current);
      }

      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }

      shotCounterRef.current = Math.max(
        shotCounterRef.current,
        index + 1
      );

      const updateCountdown = () => {
        const remaining = Math.max(0, at - Date.now());
        setCountdown(Math.ceil(remaining / 1000));
      };

      updateCountdown();

      countdownTimerRef.current = setInterval(() => {
        updateCountdown();
      }, 100);

      captureTimerRef.current = setTimeout(() => {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }

        setCountdown(null);
        capturePhoto(index);
      }, Math.max(0, at - Date.now()));
    },
    [capturePhoto]
  );

  const startCamera = useCallback(
    async (mode: "user" | "environment") => {
      try {
        setError("");

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        localStreamRef.current?.getTracks().forEach((track) => {
          track.stop();
        });

        localStreamRef.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        setFacingMode(mode);
        setLocalStreamReady(true);
        setCameraError(false);

        return stream;
      } catch {
        setCameraError(true);
        setError(
          "Impossible d'accéder à la caméra. Autorise-la dans les paramètres de ton navigateur."
        );
        return null;
      }
    },
    []
  );

  const connectRoom = useCallback(
    async (code: string, host: boolean) => {
      if (connecting) return;

      setConnecting(true);
      setError("");

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "La caméra nécessite HTTPS ou localhost dans un navigateur compatible."
          );
        }

        const stream = await startCamera(facingMode);

        if (!stream) {
          setConnecting(false);
          return;
        }

        const normalizedCode = code.trim().toUpperCase();

        setRoomCode(normalizedCode);
        setIsHost(host);
        setShots([]);
        photosRef.current = [];
        shotCounterRef.current = 0;
        pendingCandidatesRef.current = [];

        const url = new URL(window.location.href);
        url.searchParams.set("room", normalizedCode);
        window.history.replaceState({}, "", url.toString());

        setStatus("Connexion à la cabine...");

        // La salle utilise un canal Supabase Realtime dédié.
        const channel = supabase.channel(
          `oycea-photobooth-${normalizedCode}`,
          {
            config: { broadcast: { self: false } },
          }
        );

        channelRef.current = channel;

        const peer = new RTCPeerConnection(rtcConfig);
        peerRef.current = peer;

        const remoteStream = new MediaStream();
        remoteStreamRef.current = remoteStream;

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }

        stream.getTracks().forEach((track) => {
          peer.addTrack(track, stream);
        });

        peer.ontrack = (event) => {
          event.streams[0]?.getTracks().forEach((track) => {
            if (
              !remoteStream.getTracks().some(
                (existing) => existing.id === track.id
              )
            ) {
              remoteStream.addTrack(track);
            }
          });

          setRemoteReady(true);
          setStatus("Vous êtes connectés. Préparez vos poses.");
        };

        peer.onconnectionstatechange = () => {
          const state = peer.connectionState;

          if (state === "connected") {
            setRemoteReady(true);
            setStatus("Votre cabine est prête.");
          } else if (state === "failed") {
            setRemoteReady(false);
            setStatus("Connexion directe impossible.");
            setError(
              "Le réseau bloque peut-être WebRTC. Une configuration TURN peut être nécessaire."
            );
          } else if (state === "disconnected") {
            setRemoteReady(false);
            setStatus("Connexion interrompue. Tentative de reconnexion...");
          }
        };

        peer.onicecandidate = (event) => {
          if (event.candidate) {
            void sendSignal({
              type: "candidate",
              candidate: event.candidate.toJSON(),
            });
          }
        };

        const setupDataChannel = (dataChannel: RTCDataChannel) => {
          dataChannelRef.current = dataChannel;

          dataChannel.onopen = () => {
            setStatus("Connexion établie. À vous les photos !");
          };

          dataChannel.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data) as {
                type?: string;
                index?: number;
                image?: string;
              };

              if (
                message.type === "photo" &&
                typeof message.index === "number" &&
                typeof message.image === "string"
              ) {
                updateShots(message.index, "remote", message.image);
              }
            } catch {
              // Les messages non reconnus sont ignorés.
            }
          };
        };

        if (host) {
          setupDataChannel(peer.createDataChannel("oycea-photos"));
        } else {
          peer.ondatachannel = (event) => {
            setupDataChannel(event.channel);
          };
        }

        channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
          const message = payload as SignalMessage;

          try {
            if (message.type === "join" && host) {
              if (peer.signalingState !== "stable") return;

              const offer = await peer.createOffer();
              await peer.setLocalDescription(offer);

              await sendSignal({
                type: "offer",
                description: offer,
              });

              setStatus("Invitation acceptée. Connexion en cours...");
            }

            if (message.type === "offer" && !host && message.description) {
              await peer.setRemoteDescription(message.description);

              const answer = await peer.createAnswer();
              await peer.setLocalDescription(answer);

              await sendSignal({
                type: "answer",
                description: answer,
              });

              for (const candidate of pendingCandidatesRef.current) {
                await peer.addIceCandidate(candidate);
              }

              pendingCandidatesRef.current = [];
            }

            if (message.type === "answer" && host && message.description) {
              await peer.setRemoteDescription(message.description);

              for (const candidate of pendingCandidatesRef.current) {
                await peer.addIceCandidate(candidate);
              }

              pendingCandidatesRef.current = [];
            }

            if (message.type === "candidate" && message.candidate) {
              if (peer.remoteDescription) {
                await peer.addIceCandidate(message.candidate);
              } else {
                pendingCandidatesRef.current.push(message.candidate);
              }
            }

            if (
              message.type === "capture" &&
              typeof message.at === "number" &&
              typeof message.index === "number"
            ) {
              scheduleCapture(message.at, message.index);
            }
          } catch (err) {
            console.error("Erreur de signalisation WebRTC :", err);
            setError(
              "La connexion n'a pas pu être établie. Réessaie de rejoindre la cabine."
            );
          }
        });

        channel.subscribe(async (subscriptionStatus) => {
          if (subscriptionStatus === "SUBSCRIBED") {
            if (!host) {
              await sendSignal({ type: "join" });
              setStatus("Invitation envoyée. En attente de connexion...");
            } else {
              setStatus("Cabine créée. En attente de ton partenaire...");
            }

            setConnecting(false);
          } else if (subscriptionStatus === "CHANNEL_ERROR") {
            setError(
              "Impossible de rejoindre le canal Supabase Realtime. Vérifie sa configuration."
            );
            setConnecting(false);
          } else if (subscriptionStatus === "TIMED_OUT") {
            setError("La connexion a expiré. Réessaie.");
            setConnecting(false);
          }
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Impossible de démarrer le photobooth."
        );
        setConnecting(false);
      }
    },
    [
      connecting,
      facingMode,
      sendSignal,
      startCamera,
      supabase,
      updateShots,
      scheduleCapture,
    ]
  );

  useEffect(() => {
    const code = searchParams.get("room");

    if (code && /^[A-Z0-9]{6}$/.test(code.toUpperCase())) {
      setJoinCode(code.toUpperCase());
    }
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

      channelRef.current?.unsubscribe();
      peerRef.current?.close();

      localStreamRef.current?.getTracks().forEach((track) => track.stop());

      remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function createRoom() {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    await connectRoom(code, true);
  }

  async function joinRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!/^[A-Z0-9]{6}$/.test(joinCode.trim().toUpperCase())) {
      setError("Le code doit contenir exactement 6 caractères.");
      return;
    }

    await connectRoom(joinCode, false);
  }

  async function copyInvite() {
    const link = `${window.location.origin}/photobooth?room=${roomCode}`;

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Impossible de copier le lien sur cet appareil.");
    }
  }

  async function takePhoto() {
    if (!remoteReady) {
      setError("Attends que ton partenaire soit connecté avant de prendre la photo.");
      return;
    }

    if (countdown !== null) return;

    if (shotCounterRef.current >= TOTAL_SHOTS) {
      setError("Les quatre photos sont prises. Télécharge votre bande souvenir.");
      return;
    }

    const index = shotCounterRef.current;
    shotCounterRef.current += 1;
    const at = Date.now() + 3500;

    await sendSignal({
      type: "capture",
      at,
      index,
    });

    scheduleCapture(at, index);
  }

  async function downloadStrip() {
    const completeShots = photosRef.current.filter(
      (shot) => shot.local && shot.remote
    );

    if (!completeShots.length) {
      setError("Aucune photo partagée n'est encore disponible.");
      return;
    }

    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });

    try {
      const width = 900;
      const photoWidth = 390;
      const photoHeight = 300;
      const padding = 30;
      const headerHeight = 120;
      const footerHeight = 80;
      const rowHeight = photoHeight + 24;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height =
        headerHeight + padding * 2 + completeShots.length * rowHeight + footerHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "#fff9f7";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#49353d";
      ctx.textAlign = "center";
      ctx.font = "bold 42px Georgia";
      ctx.fillText("oycea.", width / 2, 62);

      ctx.font = "18px sans-serif";
      ctx.fillText("Nos petits moments, même à distance", width / 2, 96);

      for (let i = 0; i < completeShots.length; i++) {
        const shot = completeShots[i];

        const [localImage, remoteImage] = await Promise.all([
          loadImage(shot.local!),
          loadImage(shot.remote!),
        ]);

        const y = headerHeight + padding + i * rowHeight;

        ctx.fillStyle = "#f2e4e7";
        ctx.fillRect(
          padding,
          y,
          photoWidth * 2 + 20,
          photoHeight
        );

        ctx.save();
        ctx.beginPath();
        ctx.rect(padding, y, photoWidth, photoHeight);
        ctx.clip();
        ctx.drawImage(localImage, padding, y, photoWidth, photoHeight);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.rect(
          padding + photoWidth + 20,
          y,
          photoWidth,
          photoHeight
        );
        ctx.clip();
        ctx.drawImage(
          remoteImage,
          padding + photoWidth + 20,
          y,
          photoWidth,
          photoHeight
        );
        ctx.restore();

        ctx.fillStyle = "#c98298";
        ctx.font = "22px Georgia";
        ctx.fillText("♡", width / 2, y + photoHeight / 2 + 8);
      }

      ctx.fillStyle = "#49353d";
      ctx.font = "16px sans-serif";
      ctx.fillText(
        new Date().toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        width / 2,
        canvas.height - 28
      );

      const link = document.createElement("a");
      link.download = "oycea-nos-souvenirs.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      setError("Impossible de générer la bande photo. Réessaie.");
    }
  }

  async function switchCamera() {
    const next = facingMode === "user" ? "environment" : "user";
    const stream = await startCamera(next);

    if (!stream || !peerRef.current) return;

    const videoSender = peerRef.current
      .getSenders()
      .find((sender) => sender.track?.kind === "video");

    if (videoSender) {
      await videoSender.replaceTrack(stream.getVideoTracks()[0]);
    }
  }

  const completeCount = shots.filter(
    (shot) => shot.local && shot.remote
  ).length;

  return (
    <main className="min-h-screen bg-[#fff9f7] px-4 py-6 text-[#49353d] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#49353d]/70 hover:text-[#49353d]">
            <ArrowLeft size={17} />
            Retour à Oycea
          </Link>

          <Link href="/" className="text-2xl font-semibold tracking-tight">
            oycea<span className="text-[#c98298]">.</span>
          </Link>
        </header>

        <section className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#f4e3e8]">
            <Camera size={23} />
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#c98298]">
            Un souvenir à deux
          </p>

          <h1 className="mt-4 font-serif text-4xl leading-tight sm:text-6xl">
            Un seul moment,
            <br />
            <span className="italic text-[#c98298]">deux endroits.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#49353d]/70 sm:text-base">
            Retrouvez-vous dans une cabine photo virtuelle, posez ensemble
            et créez votre propre bande souvenir.
          </p>
        </section>

        {!roomCode ? (
          <section className="mx-auto mt-10 grid max-w-3xl gap-5 md:grid-cols-2">
            <article className="rounded-3xl border border-[#ecdde1] bg-white p-7">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f8edf0]">
                <Sparkles size={21} />
              </div>

              <h2 className="text-xl font-semibold">Créer une cabine</h2>

              <p className="mt-3 text-sm leading-6 text-[#49353d]/65">
                Crée une salle privée et envoie le lien à ton partenaire.
                Vous pourrez vous retrouver dans la même cabine.
              </p>

              <button
                type="button"
                onClick={createRoom}
                disabled={connecting}
                className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-[#49353d] px-5 py-3.5 text-sm font-medium text-white transition hover:bg-[#604652] disabled:opacity-50"
              >
                {connecting ? (
                  <LoaderCircle className="animate-spin" size={17} />
                ) : (
                  <Camera size={17} />
                )}
                Créer ma cabine
              </button>
            </article>

            <article className="rounded-3xl border border-[#ecdde1] bg-white p-7">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f8edf0]">
                <Heart size={21} />
              </div>

              <h2 className="text-xl font-semibold">Rejoindre mon amour</h2>

              <p className="mt-3 text-sm leading-6 text-[#49353d]/65">
                Tu as reçu un code ? Entre-le ici pour rejoindre la cabine
                créée par ton partenaire.
              </p>

              <form onSubmit={joinRoom} className="mt-6">
                <label
                  htmlFor="room-code"
                  className="mb-2 block text-xs font-medium uppercase tracking-wider text-[#49353d]/60"
                >
                  Code de la cabine
                </label>

                <input
                  id="room-code"
                  value={joinCode}
                  onChange={(event) =>
                    setJoinCode(event.target.value.toUpperCase().slice(0, 6))
                  }
                  placeholder="EX. A1B2C3"
                  maxLength={6}
                  autoComplete="off"
                  className="w-full rounded-xl border border-[#ead9de] bg-[#fff9f7] px-4 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-[#c98298]"
                />

                <button
                  type="submit"
                  disabled={connecting || joinCode.trim().length !== 6}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-[#d9b8c3] px-5 py-3.5 text-sm font-medium transition hover:bg-[#fff0f4] disabled:opacity-50"
                >
                  Rejoindre la cabine
                  <ArrowLeft className="rotate-180" size={16} />
                </button>
              </form>
            </article>
          </section>
        ) : (
          <section className="mt-10">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#ecdde1] bg-white p-4 sm:px-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#49353d]/55">
                  Code de votre cabine
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.2em]">
                  {roomCode}
                </p>
              </div>

              <button
                type="button"
                onClick={copyInvite}
                className="inline-flex items-center gap-2 rounded-full bg-[#f8edf0] px-4 py-2.5 text-sm font-medium hover:bg-[#f0dce3]"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Lien copié" : "Inviter mon partenaire"}
              </button>
            </div>

            <p className="mb-5 text-center text-sm text-[#49353d]/70">
              {status}
            </p>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="overflow-hidden rounded-3xl bg-[#32242b]">
                <div className="flex items-center justify-between px-5 py-4 text-white">
                  <span className="text-sm font-medium">Ta caméra</span>
                  <Video size={17} />
                </div>

                <div className="relative aspect-[4/3] bg-[#21191e]">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`h-full w-full object-cover ${
                      facingMode === "user" ? "-scale-x-100" : ""
                    }`}
                  />

                  {!localStreamReady && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
                      <VideoOff size={28} />
                      <span className="text-sm">Caméra indisponible</span>
                    </div>
                  )}

                  {countdown !== null && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                      <span className="font-serif text-8xl text-white">
                        {countdown === 0 ? "♡" : countdown}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-3xl bg-[#49353d]">
                <div className="flex items-center justify-between px-5 py-4 text-white">
                  <span className="text-sm font-medium">Ton partenaire</span>
                  <Heart size={17} />
                </div>

                <div className="relative aspect-[4/3] bg-[#32242b]">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="h-full w-full object-cover"
                  />

                  {!remoteReady && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white/70">
                      <LoaderCircle className="animate-spin" size={27} />
                      <span className="text-sm">
                        En attente de ton partenaire...
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mx-auto mt-7 flex max-w-xl flex-col items-center gap-4 text-center">
              <p className="text-sm text-[#49353d]/65">
                {completeCount} photo{completeCount > 1 ? "s" : ""} partagée
                {completeCount > 1 ? "s" : ""} sur {TOTAL_SHOTS}
              </p>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#ecdde1]">
                <div
                  className="h-full rounded-full bg-[#c98298] transition-all"
                  style={{
                    width: `${(completeCount / TOTAL_SHOTS) * 100}%`,
                  }}
                />
              </div>

              <div className="flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={takePhoto}
                  disabled={
                    !remoteReady ||
                    countdown !== null ||
                    shotCounterRef.current >= TOTAL_SHOTS
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#49353d] px-7 py-3.5 text-sm font-medium text-white transition hover:bg-[#604652] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Camera size={18} />
                  {shotCounterRef.current >= TOTAL_SHOTS
                    ? "Séance terminée"
                    : "Prendre la photo"}
                </button>

                <button
                  type="button"
                  onClick={switchCamera}
                  disabled={connecting}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d9b8c3] px-5 py-3.5 text-sm font-medium hover:bg-[#fff0f4] disabled:opacity-50"
                >
                  <RefreshCw size={16} />
                  Changer de caméra
                </button>
              </div>

              {shots.length > 0 && (
                <div className="mt-5 w-full rounded-3xl border border-[#ecdde1] bg-white p-5 text-left">
                  <h2 className="font-serif text-2xl">Nos souvenirs</h2>
                  <p className="mt-1 text-sm text-[#49353d]/60">
                    Les photos de chacun sont réunies dans une bande souvenir.
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {shots.map((shot) => (
                      <div
                        key={shot.index}
                        className="overflow-hidden rounded-xl bg-[#f8edf0]"
                      >
                        {shot.local ? (
                          <img
                            src={shot.local}
                            alt={`Ta photo ${shot.index + 1}`}
                            className="aspect-[3/4] w-full object-cover"
                          />
                        ) : (
                          <div className="flex aspect-[3/4] items-center justify-center text-xs text-[#49353d]/50">
                            Ta photo
                          </div>
                        )}

                        {shot.remote ? (
                          <img
                            src={shot.remote}
                            alt={`Photo du partenaire ${shot.index + 1}`}
                            className="aspect-[3/4] w-full object-cover"
                          />
                        ) : (
                          <div className="flex aspect-[3/4] items-center justify-center text-xs text-[#49353d]/50">
                            Sa photo
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={downloadStrip}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#c98298] px-5 py-3.5 text-sm font-medium text-white hover:bg-[#b76e85]"
                  >
                    <Download size={17} />
                    Télécharger notre bande photo
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {error && (
          <div
            role="alert"
            className="mx-auto mt-6 max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
            {cameraError && (
              <p className="mt-2">
                Vérifie également que ton navigateur a l&apos;autorisation
                d&apos;utiliser la caméra.
              </p>
            )}
          </div>
        )}

        <footer className="mt-16 border-t border-[#ecdde1] py-6 text-center text-xs text-[#49353d]/50">
          Des souvenirs à garder, des kilomètres à oublier.
        </footer>
      </div>
    </main>
  );
}
export default function PhotoboothPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#fff9f7] text-[#49353d]">
          Chargement du photobooth...
        </main>
      }
    >
      <PhotoboothContent />
    </Suspense>
  );
}