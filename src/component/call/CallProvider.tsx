/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  LoaderCircle,
  X,
} from "lucide-react";

type CallMedia = "audio" | "video";

type Signal = {
  from: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  mediaType?: CallMedia;
};

type CallStatus = "idle" | "outgoing" | "incoming" | "connected";

type CallContextType = {
  status: CallStatus;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMicrophone: () => void;
  startCall: (mediaType?: CallMedia) => Promise<void>;
  toggleCamera: () => void;
  cameraEnabled: boolean;
  mediaType: CallMedia;
  muted: boolean;
  duration: number;
  error: string;
};

const CallContext = createContext<CallContextType | null>(null);

export function useCall() {
  const context = useContext(CallContext);

  if (!context) {
    throw new Error("useCall doit être utilisé dans CallProvider.");
  }

  return context;
}

export default function CallProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState("");
  const [channelReady, setChannelReady] = useState(false);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const [incomingCaller, setIncomingCaller] = useState("");

  const [mediaType, setMediaType] = useState<CallMedia>("audio");
  const [cameraEnabled, setCameraEnabled] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const channelRef = useRef<any>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const incomingOfferRef = useRef<Signal | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const statusRef = useRef<CallStatus>("idle");
  const userIdRef = useRef("");
  const mountedRef = useRef(true);
  const durationRef = useRef(0);
  // Anti-rebond : timestamp du dernier raccrochage (local ou distant)
  const lastHangupRef = useRef(0);

  const updateStatus = useCallback((next: CallStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Pas connecté = pas d'appels : aucun message, aucun bouton (ex. page login).
    function applyUser(id: string) {
      userIdRef.current = id;
      setUserId(id);
    }

    async function loadUser() {
      const { data, error: authError } = await supabase.auth.getUser();

      if (!mountedRef.current) return;

      applyUser(authError || !data.user ? "" : data.user.id);
    }

    void loadUser();

    // Le layout reste monté quand on passe de /login à l'app : on suit
    // donc les connexions / déconnexions sans recharger la page.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mountedRef.current) return;
        applyUser(session?.user?.id ?? "");
      }
    );

    return () => {
      mountedRef.current = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  const sendSignal = useCallback(
    async (event: string, payload: Record<string, unknown> = {}) => {
      const channel = channelRef.current;
      const currentUserId = userIdRef.current;

      if (!currentUserId) {
        throw new Error(
          "Utilisateur non identifié. Reconnecte-toi à Oycea."
        );
      }

      if (!channel) {
        throw new Error("Le canal Supabase est absent. Recharge la page.");
      }

      const result = await channel.send({
        type: "broadcast",
        event,
        payload: {
          ...payload,
          from: currentUserId,
        },
      });

      if (result !== "ok") {
        console.error("[Oycea] Échec du signal Realtime :", {
          event,
          result,
        });

        throw new Error(
          `Échec de l'envoi du signal (${String(result)}). Vérifie les autorisations Realtime.`
        );
      }
    },
    []
  );

  const toggleCamera = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    track.enabled = !track.enabled;
    setCameraEnabled(track.enabled);
  }, []);

  const flushCandidates = useCallback(async () => {
    const pc = pcRef.current;

    if (!pc?.remoteDescription) return;

    const candidates = pendingCandidatesRef.current.splice(0);

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (candidateError) {
        console.error("ICE candidate:", candidateError);
      }
    }
  }, []);

  const disposeConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    remoteStreamRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }

    setCameraEnabled(false);
    // Réinitialisation complète de l'état distant
    incomingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    durationRef.current = 0;
    setDuration(0);
    setMuted(false);
    setIncomingCaller("");
    setMediaType("audio");
  }, []);

  // Déconnexion (ou pas d'utilisateur) : on coupe tout appel et on efface les erreurs.
  useEffect(() => {
    if (userId) return;

    disposeConnection();
    updateStatus("idle");
    setError("");
    setChannelReady(false);
  }, [userId, disposeConnection, updateStatus]);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;

      void sendSignal("ice-candidate", {
        candidate: event.candidate.toJSON(),
      }).catch((signalError) => {
        console.error("Envoi du candidat ICE:", signalError);
      });
    };

    pc.ontrack = (event) => {
      let remoteStream = event.streams[0];

      if (!remoteStream) {
        remoteStream = remoteStreamRef.current ?? new MediaStream();
        remoteStreamRef.current = remoteStream;

        if (
          !remoteStream.getTracks().some(
            (track) => track.id === event.track.id
          )
        ) {
          remoteStream.addTrack(event.track);
        }
      } else {
        remoteStreamRef.current = remoteStream;
      }

      if (audioRef.current) {
        audioRef.current.srcObject = remoteStream;
        void audioRef.current.play().catch((err) => {
          console.warn("[Oycea] Lecture audio distante impossible :", err);
        });
      }

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        void remoteVideoRef.current.play().catch((err) => {
          console.warn("[Oycea] Lecture vidéo distante impossible :", err);
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        updateStatus("connected");
        setError("");
      }

      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        disposeConnection();
        updateStatus("idle");
        lastHangupRef.current = Date.now();

        if (pc.connectionState === "failed") {
          setError(
            "Connexion impossible. Un serveur TURN peut être nécessaire sur ce réseau."
          );
        }
      }

      if (pc.connectionState === "disconnected") {
        setError("Connexion interrompue. Tentative de rétablissement…");
      }
    };

    return pc;
  }, [sendSignal, updateStatus, disposeConnection]);

  const getLocalStream = useCallback(async (withVideo = false) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Le micro et la caméra nécessitent HTTPS ou localhost."
      );
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: withVideo
        ? {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24, max: 30 },
          }
        : false,
    });

    streamRef.current = stream;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    setCameraEnabled(withVideo);
    return stream;
  }, []);

  const startCall = useCallback(
    async (requestedMedia: CallMedia = "audio") => {
      if (
        !channelReady ||
        statusRef.current !== "idle" ||
        !userIdRef.current
      ) {
        return;
      }

      setError("");

      try {
        const stream = await getLocalStream(requestedMedia === "video");
        setMediaType(requestedMedia);
        const pc = createPeerConnection();

        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        updateStatus("outgoing");

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await sendSignal("call-offer", {
          description: pc.localDescription?.toJSON(),
          mediaType: requestedMedia,
        });
      } catch (callError) {
        disposeConnection();
        updateStatus("idle");
        setError(
          callError instanceof Error
            ? callError.message
            : "Impossible de lancer l'appel."
        );
      }
    },
    [
      channelReady,
      getLocalStream,
      createPeerConnection,
      sendSignal,
      updateStatus,
      disposeConnection,
    ]
  );

  const acceptCall = useCallback(async () => {
    const offer = incomingOfferRef.current;

    if (!offer?.description || statusRef.current !== "incoming") return;

    setError("");

    try {
      const requestedMedia =
        offer.mediaType === "video" ? "video" : "audio";
      const stream = await getLocalStream(requestedMedia === "video");
      setMediaType(requestedMedia);
      const pc = createPeerConnection();

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      await pc.setRemoteDescription(
        new RTCSessionDescription(offer.description)
      );

      await flushCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await sendSignal("call-answer", {
        description: pc.localDescription?.toJSON(),
      });

      updateStatus("outgoing");
    } catch (callError) {
      disposeConnection();
      updateStatus("idle");
      lastHangupRef.current = Date.now();
      setError(
        callError instanceof Error
          ? callError.message
          : "Impossible d'accepter l'appel."
      );
    }
  }, [
    getLocalStream,
    createPeerConnection,
    flushCandidates,
    sendSignal,
    updateStatus,
    disposeConnection,
  ]);

  const rejectCall = useCallback(async () => {
    // Nettoyage local immédiat pour que l'interface se ferme tout de suite
    const caller = incomingCaller;
    disposeConnection();
    updateStatus("idle");
    lastHangupRef.current = Date.now();
    setError("");

    // Ensuite tenter d'envoyer le signal (sans bloquer)
    try {
      if (caller) {
        await sendSignal("call-reject", { target: caller });
      }
    } catch (signalError) {
      console.error(signalError);
    }
  }, [incomingCaller, sendSignal, disposeConnection, updateStatus]);

  const hangUp = useCallback(async () => {
    // Nettoyage local immédiat (interface fermée tout de suite)
    disposeConnection();
    updateStatus("idle");
    lastHangupRef.current = Date.now();
    setError("");

    // Ensuite tenter d'envoyer le signal (sans bloquer)
    try {
      await sendSignal("call-hangup");
    } catch (signalError) {
      console.error(
        "Impossible d'envoyer le signal de raccrochage:",
        signalError
      );
    }
  }, [sendSignal, disposeConnection, updateStatus]);

  const toggleMicrophone = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const nextMuted = !muted;

    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });

    setMuted(nextMuted);
  }, [muted]);

  useEffect(() => {
    if (!userId) return;

    let active = true;

    const channel = supabase.channel("oycea-private-voice", {
      config: {
        private: true,
        broadcast: { self: false },
      },
    });

    channelRef.current = channel;

    channel
      .on("broadcast", { event: "call-offer" }, ({ payload }) => {
        const signal = payload as Signal;

        if (
          !active ||
          signal.from === userIdRef.current ||
          statusRef.current !== "idle" ||
          !signal.description
        ) {
          return;
        }

        // Ignore les offres qui arrivent juste après un raccrochage
        if (Date.now() - lastHangupRef.current < 2000) {
          return;
        }

        incomingOfferRef.current = signal;
        setMediaType(signal.mediaType === "video" ? "video" : "audio");
        setIncomingCaller(signal.from);
        setError("");
        updateStatus("incoming");
      })
      .on("broadcast", { event: "call-answer" }, async ({ payload }) => {
        const signal = payload as Signal;
        const pc = pcRef.current;

        if (
          signal.from === userIdRef.current ||
          !signal.description ||
          !pc ||
          statusRef.current !== "outgoing"
        ) {
          return;
        }

        try {
          await pc.setRemoteDescription(
            new RTCSessionDescription(signal.description)
          );
          await flushCandidates();
        } catch (signalError) {
          console.error("Réponse WebRTC:", signalError);
        }
      })
      .on("broadcast", { event: "ice-candidate" }, async ({ payload }) => {
        const signal = payload as Signal;

        if (signal.from === userIdRef.current || !signal.candidate) {
          return;
        }

        const pc = pcRef.current;

        if (!pc?.remoteDescription) {
          pendingCandidatesRef.current.push(signal.candidate);
          return;
        }

        try {
          await pc.addIceCandidate(
            new RTCIceCandidate(signal.candidate)
          );
        } catch (candidateError) {
          console.error("Réception du candidat ICE:", candidateError);
        }
      })
      .on("broadcast", { event: "call-reject" }, ({ payload }) => {
        if (
          (payload as Signal & { target?: string }).target !==
          userIdRef.current
        ) {
          return;
        }

        disposeConnection();
        updateStatus("idle");
        lastHangupRef.current = Date.now();
        setError("Ton partenaire a refusé l'appel.");
      })
      .on("broadcast", { event: "call-hangup" }, ({ payload }) => {
        const signal = payload as Signal;

        if (signal.from === userIdRef.current) return;

        // Nettoyage complet côté distant
        disposeConnection();
        updateStatus("idle");
        lastHangupRef.current = Date.now();
        setError("");
      })
      .subscribe((subscriptionStatus, err) => {
        if (!active) return;

        if (err) {
          console.error("[Oycea] Erreur Realtime :", err);
        }

        if (subscriptionStatus === "SUBSCRIBED") {
          setChannelReady(true);
          setError("");
          return;
        }

        setChannelReady(false);

        if (
          subscriptionStatus === "CHANNEL_ERROR" ||
          subscriptionStatus === "TIMED_OUT"
        ) {
          setError(
            "Connexion aux appels impossible. Vérifie la configuration Realtime de Supabase."
          );
        } else if (subscriptionStatus === "CLOSED") {
          setError("La connexion aux appels a été fermée.");
        }
      });

    return () => {
      active = false;
      setChannelReady(false);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [
    userId,
    supabase,
    disposeConnection,
    updateStatus,
    flushCandidates,
  ]);

  useEffect(() => {
    if (status !== "connected") return;

    const interval = window.setInterval(() => {
      setDuration((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(() => {
    return () => {
      disposeConnection();
    };
  }, [disposeConnection]);

  useEffect(() => {
    if (status === "idle" || mediaType !== "video") return;

    const localVideo = localVideoRef.current;
    const localStream = streamRef.current;

    if (localVideo && localStream) {
      localVideo.srcObject = localStream;

      void localVideo.play().catch((err) => {
        console.warn("[Oycea] Lecture vidéo locale impossible :", err);
      });
    }

    const remoteVideo = remoteVideoRef.current;
    const remoteStream = remoteStreamRef.current;

    if (remoteVideo && remoteStream) {
      remoteVideo.srcObject = remoteStream;

      void remoteVideo.play().catch((err) => {
        console.warn("[Oycea] Lecture vidéo distante impossible :", err);
      });
    }
  }, [status, mediaType]);

  const value: CallContextType = {
    status,
    startCall,
    acceptCall,
    rejectCall,
    hangUp,
    toggleMicrophone,
    toggleCamera,
    cameraEnabled,
    mediaType,
    muted,
    duration,
    error,
  };

  return (
    <CallContext.Provider value={value}>
      {children}

      <audio ref={audioRef} autoPlay playsInline />

      {status !== "idle" && mediaType === "video" && (
        <div className="fixed bottom-24 left-3 right-3 z-[99] grid grid-cols-2 gap-2 overflow-hidden rounded-2xl border border-[#eedde1] bg-[#49353d] p-2 shadow-2xl">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
              Partenaire
            </span>
          </div>

          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
              Moi
            </span>
          </div>
        </div>
      )}

      {userId && <CallOverlay channelReady={channelReady} />}
    </CallContext.Provider>
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    remaining
  ).padStart(2, "0")}`;
}

function CallOverlay({ channelReady }: { channelReady: boolean }) {
  const {
    status,
    startCall,
    acceptCall,
    rejectCall,
    hangUp,
    toggleMicrophone,
    toggleCamera,
    cameraEnabled,
    mediaType,
    muted,
    duration,
    error,
  } = useCall();

  const [expanded, setExpanded] = useState(false);
  const [dismissedError, setDismissedError] = useState("");

  // Une erreur au repos s'affiche en petite bulle qui disparaît toute seule.
  useEffect(() => {
    if (!error || status !== "idle") return;

    const timer = window.setTimeout(() => setDismissedError(error), 6000);
    return () => window.clearTimeout(timer);
  }, [error, status]);

  // Fermer les commandes quand l'appel se termine ou qu'une erreur apparaît.
  useEffect(() => {
    if (status === "idle") {
      setExpanded(false);
    }
  }, [status]);

  useEffect(() => {
    if (error) {
      setExpanded(false);
    }
  }, [error]);

  // Bouton flottant lorsque l'appel est en cours.
  if (status !== "idle" && status !== "incoming" && !expanded) {
    return (
      <div className="fixed bottom-5 right-4 z-[100]">
        <button
          onClick={() => setExpanded(true)}
          aria-label="Afficher les commandes de l'appel"
          className="flex h-14 items-center gap-3 rounded-full border border-[#eedde1] bg-[#49353d] px-4 text-white shadow-2xl transition hover:bg-[#644653]"
        >
          <Phone size={18} />
          <span className="text-sm font-medium">
            {formatDuration(duration)}
          </span>
          <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
        </button>
      </div>
    );
  }

  // Bouton d'appel habituel lorsqu'aucun appel n'est actif.
  if (status === "idle") {
    return (
      <div className="fixed bottom-5 right-4 z-[100]">
        {error && error !== dismissedError && !expanded && (
          <div
            role="status"
            className="absolute bottom-16 right-0 flex w-[min(288px,calc(100vw-32px))] items-start gap-3 rounded-2xl border border-[#f0d2d9] bg-white p-4 text-sm leading-6 text-[#a34d68] shadow-2xl"
          >
            <p className="flex-1">{error}</p>
            <button
              onClick={() => setDismissedError(error)}
              aria-label="Fermer le message"
              className="rounded-full p-1 text-[#907b82] hover:bg-[#fff0f4]"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <button
          onClick={() => setExpanded((value) => !value)}
          aria-label="Ouvrir les commandes d'appel"
          className="flex h-14 items-center gap-3 rounded-full bg-[#49353d] px-5 text-sm font-medium text-white shadow-xl transition hover:bg-[#644653]"
        >
          <Phone size={18} />
          <span>Appel</span>
        </button>

        {expanded && (
          <div className="absolute bottom-16 right-0 w-[min(288px,calc(100vw-32px))] rounded-2xl border border-[#f0dfe3] bg-white p-5 text-[#49353d] shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Appel privé</h2>
              <button
                onClick={() => setExpanded(false)}
                aria-label="Fermer"
                className="rounded-full p-1 text-[#907b82] hover:bg-[#fff0f4]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                disabled={!channelReady}
                onClick={() => {
                  setExpanded(false);
                  void startCall("audio");
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#fff0f4] px-3 py-3 text-sm text-[#ad7187] disabled:opacity-50"
              >
                <Phone size={17} />
                Audio
              </button>

              <button
                disabled={!channelReady}
                onClick={() => {
                  setExpanded(false);
                  void startCall("video");
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#c98298] px-3 py-3 text-sm text-white disabled:opacity-50"
              >
                <Video size={17} />
                Vidéo
              </button>
            </div>

            <p className="mt-3 text-sm leading-6 text-[#907b82]">
              Appelle ton partenaire sans quitter la page.
            </p>

            {!channelReady && (
              <p className="mt-2 text-xs text-[#907b82]">
                Connexion au service d&apos;appel…
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // Panneau développé : appel entrant ou commandes de l'appel actif.
  return (
    <div className="fixed bottom-5 right-4 z-[100] w-[min(340px,calc(100vw-32px))] rounded-3xl border border-[#eedde1] bg-white p-5 text-[#49353d] shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.15em] text-[#ad7187]">
            OYCEA · APPEL PRIVÉ
          </p>

          <h2 className="mt-2 text-lg font-medium">
            {status === "incoming"
              ? "Appel entrant"
              : status === "connected"
                ? "Vous êtes en ligne"
                : "Appel en cours"}
          </h2>

          <p className="mt-1 text-sm text-[#907b82]">
            {status === "connected"
              ? formatDuration(duration)
              : status === "incoming"
                ? "Ton partenaire souhaite te parler."
                : "En attente de connexion…"}
          </p>
        </div>

        {status !== "incoming" && (
          <button
            onClick={() => setExpanded(false)}
            aria-label="Réduire les commandes"
            className="rounded-full p-2 text-[#907b82] transition hover:bg-[#fff0f4]"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm leading-6 text-red-600">{error}</p>
      )}

      {status === "incoming" ? (
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => void rejectCall()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#f8e9ed] px-3 py-3 text-sm text-[#a34d68]"
          >
            <PhoneOff size={17} />
            Refuser
          </button>

          <button
            onClick={() => void acceptCall()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#c98298] px-3 py-3 text-sm font-medium text-white"
          >
            <Phone size={17} />
            Accepter
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5 flex gap-2">
            <button
              onClick={toggleMicrophone}
              disabled={status !== "connected"}
              aria-label={muted ? "Activer le micro" : "Couper le micro"}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#fff0f4] text-[#ad7187] disabled:opacity-50"
            >
              {muted ? <MicOff size={18} /> : <Mic size={18} />}
              <span className="text-xs">
                {muted ? "Micro coupé" : "Micro"}
              </span>
            </button>

            <button
              onClick={toggleCamera}
              disabled={mediaType !== "video"}
              aria-label={
                cameraEnabled ? "Couper la caméra" : "Activer la caméra"
              }
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#fff0f4] text-[#ad7187] disabled:opacity-50"
            >
              {cameraEnabled ? (
                <Video size={18} />
              ) : (
                <VideoOff size={18} />
              )}
              <span className="text-xs">
                {cameraEnabled ? "Caméra" : "Caméra coupée"}
              </span>
            </button>

            <button
              onClick={() => void hangUp()}
              aria-label="Raccrocher"
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#a9445e] text-white"
            >
              <PhoneOff size={18} />
              <span className="text-xs">Fin</span>
            </button>
          </div>

          <button
            onClick={() => setExpanded(false)}
            className="mt-3 w-full rounded-xl border border-[#eedde1] px-3 py-2 text-sm text-[#907b82] transition hover:bg-[#fff8fa]"
          >
            Réduire les commandes
          </button>
        </>
      )}
    </div>
  );
}