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


type CallStatus =
  | "idle"
  | "outgoing"
  | "incoming"
  | "connected";



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

export default function CallProvider({
  children,
}: {
  children: ReactNode;
}) {
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

  const updateStatus = useCallback((next: CallStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    async function loadUser() {
      const { data, error: authError } = await supabase.auth.getUser();

      if (!mountedRef.current) return;

      if (authError || !data.user) {
        setError("Connecte-toi pour utiliser les appels.");
        return;
      }

      userIdRef.current = data.user.id;
      setUserId(data.user.id);
    }

    void loadUser();

    return () => {
      mountedRef.current = false;
    };
  }, [supabase]);

  const sendSignal = useCallback(
    async (event: string, payload: Record<string, unknown> = {}) => {
      const channel = channelRef.current;

      if (!channel || !userIdRef.current) {
        throw new Error("Le canal d'appel n'est pas prêt.");
      }

      const result = await channel.send({
        type: "broadcast",
        event,
        payload: {
          ...payload,
          from: userIdRef.current,
        },
      });

      if (result !== "ok") {
        throw new Error("Impossible d'envoyer le signal d'appel.");
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

    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }

    incomingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    durationRef.current = 0;
    setDuration(0);
    setMuted(false);
    setIncomingCaller("");
  }, []);

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
  const remoteStream = event.streams[0];

  if (audioRef.current && remoteStream) {
    audioRef.current.srcObject = remoteStream;
    void audioRef.current.play().catch(() => {
      setError("Clique sur la page pour autoriser la lecture audio.");
    });
  }

  if (remoteVideoRef.current && remoteStream) {
    remoteVideoRef.current.srcObject = remoteStream;
    void remoteVideoRef.current.play().catch(() => {
      setError("Clique sur la page pour démarrer la vidéo.");
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


const startCall = useCallback(async (requestedMedia: CallMedia = "audio") => {
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
  }, [
    channelReady,
    getLocalStream,
    createPeerConnection,
    sendSignal,
    updateStatus,
    disposeConnection,
  ]);

  const acceptCall = useCallback(async () => {
    const offer = incomingOfferRef.current;

    if (!offer?.description || statusRef.current !== "incoming") return;

    setError("");

    try {
const requestedMedia = offer.mediaType === "video" ? "video" : "audio";
const stream = await getLocalStream(requestedMedia === "video");
setMediaType(requestedMedia);      const pc = createPeerConnection();

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
    try {
      if (incomingCaller) {
        await sendSignal("call-reject", {
          target: incomingCaller,
        });
      }
    } catch (signalError) {
      console.error(signalError);
    }

    disposeConnection();
    updateStatus("idle");
    setError("");
  }, [
    incomingCaller,
    sendSignal,
    disposeConnection,
    updateStatus,
  ]);

  const hangUp = useCallback(async () => {
    try {
      await sendSignal("call-hangup");
    } catch (signalError) {
      console.error(signalError);
    }

    disposeConnection();
    updateStatus("idle");
    setError("");
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
          (payload as Signal & { target?: string }).target !== userIdRef.current
        ) {
          return;
        }

        disposeConnection();
        updateStatus("idle");
        setError("Ton partenaire a refusé l'appel.");
      })
      .on("broadcast", { event: "call-hangup" }, ({ payload }) => {
        const signal = payload as Signal;

        if (signal.from === userIdRef.current) return;

        disposeConnection();
        updateStatus("idle");
        setError("L'appel a été terminé.");
      })
      .subscribe((subscriptionStatus) => {
        if (!active) return;

        if (subscriptionStatus === "SUBSCRIBED") {
          setChannelReady(true);
          setError("");
        } else if (subscriptionStatus === "CHANNEL_ERROR") {
          setChannelReady(false);
          setError("Impossible de rejoindre le canal privé des appels.");
        } else if (subscriptionStatus === "CLOSED") {
          setChannelReady(false);
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

  const value: CallContextType = {
      status,
      startCall,

      acceptCall,
      rejectCall,
      hangUp,
      toggleMicrophone,
      muted,
      duration,
      error,
      toggleCamera: function (): void {
          throw new Error("Function not implemented.");
      },
      cameraEnabled: false,
      mediaType: "audio"
  };

  return (
    <CallContext.Provider value={value}>
      {children}

<audio ref={audioRef} autoPlay playsInline />

{status !== "idle" && mediaType === "video" && (
  <div className="fixed bottom-5 left-5 z-[99] grid w-[min(520px,calc(100vw-40px))] grid-cols-2 gap-2 overflow-hidden rounded-2xl border border-[#eedde1] bg-[#49353d] p-2 shadow-2xl">
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

      <CallOverlay channelReady={channelReady} />
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

  if (status === "idle" && !error) {
    return (
      <div className="fixed bottom-5 right-5 z-[100]">
        <button
          onClick={() => {
            setExpanded((value) => !value);
          }}
          className="flex h-14 items-center gap-3 rounded-full bg-[#49353d] px-5 text-sm font-medium text-white shadow-xl transition hover:bg-[#644653]"
          aria-label="Ouvrir les commandes d'appel"
        >
          <Phone size={18} />
          <span>Appel</span>
        </button>

        {expanded && (
          <div className="absolute bottom-16 right-0 w-72 rounded-2xl border border-[#f0dfe3] bg-white p-5 text-[#49353d] shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Appel privé</h2>
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
            </div>

            <p className="mt-2 text-sm leading-6 text-[#907b82]">
              Appelez votre partenaire sans quitter la page.
            </p>

            {error && (
              <p className="mt-3 text-sm text-red-600">{error}</p>
            )}

            <button
              disabled={!channelReady}
              onClick={() => {
                setExpanded(false);
                void startCall();
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#c98298] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {!channelReady ? (
                <LoaderCircle size={17} className="animate-spin" />
              ) : (
                <Phone size={17} />
              )}
              {channelReady ? "Lancer un appel" : "Connexion…"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-[100] w-[min(340px,calc(100vw-40px))] rounded-3xl border border-[#eedde1] bg-white p-5 text-[#49353d] shadow-2xl">
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

        <span
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
            status === "connected"
              ? "bg-emerald-500"
              : status === "incoming"
                ? "animate-pulse bg-[#c98298]"
                : "animate-pulse bg-amber-400"
          }`}
        />
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
        <div className="mt-5 flex gap-3">
          <button
            onClick={toggleMicrophone}
            disabled={status !== "connected"}
            aria-label={muted ? "Activer le micro" : "Couper le micro"}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#fff0f4] text-[#ad7187] disabled:opacity-50"
          >
            {muted ? <MicOff size={18} /> : <Mic size={18} />}
            <span className="text-sm">
              {muted ? "Micro coupé" : "Micro"}
            </span>
          </button>
<button
  onClick={toggleCamera}
  disabled={mediaType !== "video"}
  aria-label={cameraEnabled ? "Couper la caméra" : "Activer la caméra"}
  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#fff0f4] text-[#ad7187] disabled:opacity-50"
>
  {cameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}
  <span className="text-sm">
    {cameraEnabled ? "Caméra" : "Caméra coupée"}
  </span>
</button>
          <button
            onClick={() => void hangUp()}
            aria-label="Raccrocher"
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#a9445e] text-white"
          >
            <PhoneOff size={18} />
            <span className="text-sm">Raccrocher</span>
          </button>
        </div>
      )}
    </div>
  );
}
