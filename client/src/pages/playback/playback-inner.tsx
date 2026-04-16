/**
 * Playback session: audio engine, visual background, lyrics HUD, and pause overlay.
 * Route shell (`Playback`) mounts this with a `key` of `file_hash` so state resets per track.
 */

import { Background, SOURCE_VIDEO_INDEX } from "@/components/playback/background";
import { LyricsDisplay } from "@/components/playback/lyrics-display";
import { PauseOverlay } from "@/components/playback/pause-overlay";
import { PitchGraph } from "@/components/playback/pitch-graph";
import { PlaybackHud } from "@/components/playback/playback-hud";
import { FLAVORS, type VideoFlavor } from "@/components/playback/video-background";
import {
  usePlaybackConfigPersist,
  usePlaybackInput,
  usePlaybackTranscript,
} from "@/hooks/playback";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { useMultiChannelAudioPlayer } from "@/hooks/use-multi-channel-audio-player";
import { useMicCapture, useMicDevices, useMicPitch } from "@/hooks/use-mic-pitch";
import { useMultiMic } from "@/hooks/use-multi-mic";
import { usePitchScoring } from "@/hooks/use-pitch-scoring";
import { useMultiPitchScoring } from "@/hooks/use-multi-pitch-scoring";
import { PROFILES } from "@/queries/keys";
import { useProfiles } from "@/queries/use-profiles";
import { addScore } from "@/tauri-bridge/profile";
import type { Song } from "@/types/Song";
import type { AppConfig } from "@/types/AppConfig";
import type { MultiChannelConfig } from "@/tauri-bridge/multi-channel-audio";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { INTRO_SKIP_LEAD_SEC } from "@/utils/playback/transcript-segments";

import successSoundUrl from "@/assets/sounds/success.mp3";
import { ResultDialog } from "@/components/playback/dialogs/result";
import {
  ensureMp3Stems,
  ensurePlayableSourceVideo,
  getAudioPaths,
  getMultiSingerAudioPaths,
  loadMultiSingerMetadata,
  getMediaPort,
  onStemsReady,
  type MultiSingerMetadata,
} from "@/tauri-bridge/playback";
import { joinMediaUrl } from "@/adapters/playback";
import type { PlaylistContext } from "./playback";

export interface PlaybackInnerProps {
  song: Song;
  config: AppConfig | null;
  playlistContext?: PlaylistContext;
}

export function PlaybackInner({ song, config, playlistContext }: PlaybackInnerProps) {
  const fileHash = song.file_hash;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profileData, isLoading: profilesLoading } = useProfiles();

  const [showResult, setShowResult] = useState(false);
  const [resultScore, setResultScore] = useState(0);

  const initialTheme = config?.last_theme ?? 0;
  const initialGuideVolumeRef = useRef(config?.guide_volume ?? 0.3);
  const initialGuideVolume = initialGuideVolumeRef.current;
  const initialVideoFlavor = config?.last_video_flavor ?? 0;

  const [paused, setPaused] = useState(false);
  const [themeIndex, setThemeIndex] = useState(song.is_video ? SOURCE_VIDEO_INDEX : initialTheme);
  const [flavorIndex, setFlavorIndex] = useState(initialVideoFlavor);

  const { segments, transcriptSource, availableVariants, activeScript, toggleScript } =
    usePlaybackTranscript(fileHash);
  const persistConfig = usePlaybackConfigPersist(config);

  const [stemsReady, setStemsReady] = useState(false);
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    // Register the event listener BEFORE triggering the Rust command to avoid a
    // race where the "stems-ready" event fires before the listener is set up
    // (happens when variant stems already exist and the command returns instantly).
    (async () => {
      const fn = await onStemsReady((event) => {
        if (cancelled) return;
        if (event.file_hash !== fileHash) return;
        if (event.error) {
          toast.error(`Stem conversion failed: ${event.error}`);
          navigate("/", { replace: true });
        } else {
          setStemsReady(true);
        }
      });
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;

      // Now that the listener is active, trigger the stem check
      ensureMp3Stems(fileHash);
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [fileHash, navigate]);

  const [sourceVideoPath, setSourceVideoPath] = useState<string | undefined>(
    song.is_video ? song.path : undefined,
  );
  useEffect(() => {
    if (!song.is_video) {
      setSourceVideoPath(undefined);
      return;
    }

    let cancelled = false;
    setSourceVideoPath(song.path);

    void ensurePlayableSourceVideo(fileHash)
      .then((path) => {
        if (cancelled) return;
        if (path && path !== song.path) {
          setSourceVideoPath(path);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [fileHash, song.is_video, song.path]);

  // ── Decode vocals buffer for pitch analysis (player-independent) ────────
  // Fetched as soon as stems are ready so the green reference line is
  // available regardless of whether the standard or multi-channel player is
  // active.  Includes retry with back-off in case the media server is busy
  // (e.g. streaming a large source video for video files).
  const [vocalsBuffer, setVocalsBuffer] = useState<AudioBuffer | null>(null);
  const [multiSingerRefs, setMultiSingerRefs] = useState<(AudioBuffer | null)[] | null>(null);
  const [multiSingerMeta, setMultiSingerMeta] = useState<MultiSingerMetadata | null>(null);
  const [multiSingerMode, setMultiSingerMode] = useState(false);
  const canUseMultiSinger = song.has_multi_singer_stems;

  useEffect(() => {
    // Reset to false on song change — the metadata-loading effect will
    // apply the user’s preferred default_multi_singer_mode once loaded.
    setMultiSingerMode(false);
    setMultiSingerMeta(null);
  }, [fileHash]);
  useEffect(() => {
    if (!stemsReady) return;
    let cancelled = false;
    setVocalsBuffer(null);

    (async () => {
      const MAX_RETRIES = 6;
      const BASE_DELAY_MS = 400;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (cancelled) return;
        try {
          const [port, paths] = await Promise.all([getMediaPort(), getAudioPaths(fileHash)]);
          const url = joinMediaUrl(`http://127.0.0.1:${port}`, paths.vocals);
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          if (cancelled) return;
          const ctx = new AudioContext();
          const buf = await ctx.decodeAudioData(await resp.arrayBuffer());
          await ctx.close();
          if (!cancelled) {
            setVocalsBuffer(buf);
            console.log(
              `[PlaybackInner] Vocals buffer decoded for analysis (attempt ${attempt + 1})`,
            );
          }
          return;
        } catch (e) {
          if (attempt < MAX_RETRIES - 1) {
            const delay = BASE_DELAY_MS * 2 ** attempt;
            console.warn(
              `[PlaybackInner] Vocals decode attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
              e,
            );
            await new Promise((r) => setTimeout(r, delay));
          } else {
            console.warn("[PlaybackInner] Failed to decode vocals after all retries:", e);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stemsReady, fileHash]);

  useEffect(() => {
    if (!stemsReady || !canUseMultiSinger) {
      setMultiSingerRefs(null);
      return;
    }
    let cancelled = false;
    setMultiSingerRefs(null);

    (async () => {
      try {
        const [port, multiPaths, metadata] = await Promise.all([
          getMediaPort(),
          getMultiSingerAudioPaths(fileHash),
          loadMultiSingerMetadata(fileHash),
        ]);
        if (cancelled || !multiPaths) return;
        setMultiSingerMeta(metadata);
        if (metadata) {
          setMultiSingerMode(metadata.default_multi_singer_mode);
        }

        const ctx = new AudioContext();
        const loadBuffer = async (path: string): Promise<AudioBuffer | null> => {
          const url = joinMediaUrl(`http://127.0.0.1:${port}`, path);
          const resp = await fetch(url);
          if (!resp.ok) return null;
          const decoded = await ctx.decodeAudioData(await resp.arrayBuffer());
          return decoded;
        };

        const [s1, s2] = await Promise.all([
          loadBuffer(multiPaths.singer_1),
          loadBuffer(multiPaths.singer_2),
        ]);
        await ctx.close();

        if (!cancelled && s1 && s2) {
          const refs = metadata?.swap_references ? [s2, s1] : [s1, s2];
          setMultiSingerRefs(refs);
        }
      } catch (err) {
        console.warn("[PlaybackInner] Failed to load multi-singer references:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stemsReady, canUseMultiSinger, fileHash]);

  // Channel routing configuration from global config
  const channelRoutingConfig = useMemo<MultiChannelConfig | null>(() => {
    if (!config?.enable_channel_routing) {
      return null;
    }

    // Only create config if all required fields are present
    if (
      config.vocals_device_name &&
      config.instrumental_device_name &&
      config.vocals_start_channel !== null &&
      config.vocals_start_channel !== undefined &&
      config.instrumental_start_channel !== null &&
      config.instrumental_start_channel !== undefined
    ) {
      const cfg = {
        vocalsRouting: {
          deviceName: config.vocals_device_name,
          startChannel: config.vocals_start_channel,
        },
        instrumentalRouting: {
          deviceName: config.instrumental_device_name,
          startChannel: config.instrumental_start_channel,
        },
      };
      return cfg;
    }

    return null;
  }, [config]);

  const useMultiChannel = channelRoutingConfig !== null;

  // Default config to avoid re-creating on every render
  const defaultConfig = useRef<MultiChannelConfig>({
    vocalsRouting: { deviceName: "", startChannel: 0 },
    instrumentalRouting: { deviceName: "", startChannel: 0 },
  });

  // Conditionally use multi-channel or Web Audio player
  const webAudioPlayer = useAudioPlayer(
    fileHash,
    initialGuideVolume,
    stemsReady && !useMultiChannel,
  );
  const multiChannelPlayer = useMultiChannelAudioPlayer(
    fileHash,
    channelRoutingConfig ?? defaultConfig.current,
    stemsReady && useMultiChannel,
  );

  // Use the active player
  const audio = useMultiChannel ? multiChannelPlayer : webAudioPlayer;

  const [micUserEnabled, setMicUserEnabled] = useState(config?.mic_active ?? true);
  const [micMirrorUserEnabled, setMicMirrorUserEnabled] = useState(config?.mic_mirroring ?? false);
  const [selectedMicId, setSelectedMicId] = useState<string | null>(config?.preferred_mic ?? null);
  const micDevices = useMicDevices();

  // ── Multi-mic configuration ──────────────────────────────────────────────
  const micSlotCount = config?.mic_slot_count ?? 1;
  const useMultiMicMode = micSlotCount > 1;

  const mappedSlotReferenceBuffers = useMemo(() => {
    if (!multiSingerMode || !multiSingerRefs) return null;
    const bySlot: (AudioBuffer | null)[] = Array.from({ length: micSlotCount }, () => null);

    const singer1Slot = config?.singer_1_mic_slot ?? 0;
    const singer2Slot = config?.singer_2_mic_slot ?? 1;

    if (singer1Slot >= 0 && singer1Slot < micSlotCount) {
      bySlot[singer1Slot] = multiSingerRefs[0] ?? null;
    }
    if (singer2Slot >= 0 && singer2Slot < micSlotCount) {
      bySlot[singer2Slot] = multiSingerRefs[1] ?? null;
    }
    if (!bySlot.some(Boolean) && micSlotCount > 0) {
      bySlot[0] = multiSingerRefs[0] ?? null;
      if (micSlotCount > 1) bySlot[1] = multiSingerRefs[1] ?? null;
    }
    return bySlot;
  }, [
    multiSingerMode,
    multiSingerRefs,
    micSlotCount,
    config?.singer_1_mic_slot,
    config?.singer_2_mic_slot,
  ]);

  // Build per-slot configs from persisted settings
  const multiMicSlotConfigs = useMemo(() => {
    const slots = config?.mic_slots ?? [];
    return Array.from({ length: micSlotCount }, (_, i) => ({
      deviceName: slots[i]?.device_name ?? null,
      inputChannel: slots[i]?.input_channel ?? null,
    }));
  }, [config?.mic_slots, micSlotCount]);

  // ── Legacy single-mic hooks (active when micSlotCount == 1) ──────────────
  const micPitchEnabled = audio.isReady && audio.isPlaying && !paused && micUserEnabled;
  const micMirrorEnabled = audio.isReady && audio.isPlaying && !paused && micMirrorUserEnabled;
  const { active: micCaptureActive, error: micCaptureError } = useMicCapture(
    !useMultiMicMode ? selectedMicId : null,
    {
      emit_pitch: !useMultiMicMode && micPitchEnabled,
      emit_audio: !useMultiMicMode && micMirrorEnabled,
    },
    !useMultiMicMode ? (config?.preferred_mic_channel ?? null) : null,
  );
  const {
    latestPitch,
    latestRms,
    active: micPitchActive,
    error: micPitchError,
  } = useMicPitch(!useMultiMicMode && micPitchEnabled);
  const { series, score } = usePitchScoring(
    audio,
    useMultiMicMode ? null : latestPitch,
    vocalsBuffer,
  );

  // ── Multi-mic hooks (active when micSlotCount > 1) ───────────────────────
  const multiMicEnabled =
    useMultiMicMode && audio.isReady && audio.isPlaying && !paused && micUserEnabled;
  const { slots: multiMicSlots, activeCount: multiMicActiveCount } = useMultiMic({
    slotCount: useMultiMicMode ? micSlotCount : 0,
    slotConfigs: multiMicSlotConfigs,
    enabled: multiMicEnabled,
    emitPitch: multiMicEnabled,
    emitAudio: false,
  });
  const multiScoringResults = useMultiPitchScoring(
    audio,
    multiMicSlots,
    useMultiMicMode ? multiMicActiveCount : 0,
    vocalsBuffer,
    mappedSlotReferenceBuffers,
  );

  // ── Unified score for saving ─────────────────────────────────────────────
  // In multi-mic mode, save the highest slot score.
  const effectiveScore = useMultiMicMode
    ? Math.max(0, ...multiScoringResults.slice(0, micSlotCount).map((r) => r.score))
    : score;
  const slotScoresForHud = useMultiMicMode
    ? multiScoringResults
        .slice(0, micSlotCount)
        .map((r, i) => (multiMicSlots[i]?.active ? r.score : null))
    : null;
  const micErrorShown = useRef(false);
  const scoreRef = useRef(effectiveScore);
  scoreRef.current = effectiveScore;
  const finishHandledRef = useRef(false);
  const [skipOutroPending, setSkipOutroPending] = useState(false);

  useEffect(() => {
    const micError = micCaptureError ?? micPitchError;
    if (micError && !micErrorShown.current) {
      micErrorShown.current = true;
      toast.error(`Microphone: ${micError}`);
    }
    if (!micError) {
      micErrorShown.current = false;
    }
  }, [micCaptureError, micPitchError]);

  // Show errors from multi-mic slots
  useEffect(() => {
    if (!useMultiMicMode) return;
    for (const s of multiMicSlots) {
      if (s.error) {
        toast.error(`Mic slot ${s.slot + 1}: ${s.error}`);
      }
    }
  }, [useMultiMicMode, multiMicSlots]);

  const handleToggleMic = useCallback(() => {
    setMicUserEnabled((prev) => {
      const next = !prev;
      if (!next && micMirrorUserEnabled) {
        setMicMirrorUserEnabled(false);
        persistConfig({ mic_active: false, mic_mirroring: false });
      } else {
        persistConfig({ mic_active: next });
      }

      return next;
    });
  }, [persistConfig, micMirrorUserEnabled]);

  const handleCycleMic = useCallback(() => {
    if (micDevices.length <= 1) return;
    const currentIdx = micDevices.findIndex((d) => d.deviceId === selectedMicId);
    const nextIdx = (currentIdx + 1) % micDevices.length;
    const next = micDevices[nextIdx];
    setSelectedMicId(next.deviceId);
    persistConfig({ preferred_mic: next.deviceId });
  }, [micDevices, selectedMicId, persistConfig]);

  const handleToggleMicMirror = useCallback(() => {
    setMicMirrorUserEnabled((prev) => {
      const next = !prev;
      persistConfig({ mic_mirroring: next });
      if (next && !micUserEnabled) {
        setMicUserEnabled(true);
        persistConfig({ mic_active: true });
      }
      return next;
    });
  }, [persistConfig, micUserEnabled]);

  useEffect(() => {
    if (!audio.isFinished && !skipOutroPending) {
      return;
    }

    if (profilesLoading && !profileData) {
      return;
    }

    if (finishHandledRef.current) {
      return;
    }

    finishHandledRef.current = true;
    setSkipOutroPending(false);

    const finalScore = scoreRef.current;
    const active = profileData?.active ?? null;
    const shouldShowResult = finalScore > 0;

    if (!shouldShowResult) {
      navigate("/", { replace: true });

      return;
    }

    void (async () => {
      try {
        if (active != null) {
          await addScore(fileHash, finalScore);
          await queryClient.invalidateQueries({ queryKey: PROFILES });
        }
        setResultScore(finalScore);
        setShowResult(true);
      } catch (e) {
        toast.error(`Could not save score: ${e instanceof Error ? e.message : String(e)}`);
        navigate("/", { replace: true });
      }
    })();
  }, [
    audio.isFinished,
    skipOutroPending,
    fileHash,
    navigate,
    profileData,
    profilesLoading,
    queryClient,
  ]);

  useEffect(() => {
    if (!showResult) {
      return;
    }

    const audioEl = new Audio(successSoundUrl);
    void audioEl.play().catch(() => {});

    return () => {
      audioEl.pause();
      audioEl.src = "";
    };
  }, [showResult]);

  // ── Playlist: compute next song ────────────────────────────────────────
  const nextSong = useMemo(() => {
    if (!playlistContext) return null;
    const { songs: plSongs, currentIndex, playMode } = playlistContext;
    if (plSongs.length <= 1) return null;

    if (playMode === "Random") {
      let idx: number;
      do {
        idx = Math.floor(Math.random() * plSongs.length);
      } while (idx === currentIndex && plSongs.length > 1);
      return { song: plSongs[idx], index: idx };
    }

    // Sequential
    const nextIdx = (currentIndex + 1) % plSongs.length;
    return { song: plSongs[nextIdx], index: nextIdx };
  }, [playlistContext]);

  const [showNextSongPreview, setShowNextSongPreview] = useState(false);

  // Show "Next Song" preview in last 15 seconds of playback
  useEffect(() => {
    if (!nextSong || !audio.duration || audio.duration <= 0) {
      setShowNextSongPreview(false);
      return;
    }

    const checkInterval = setInterval(() => {
      const currentTime = audio.getCurrentTime();
      const remaining = audio.duration - currentTime;
      setShowNextSongPreview(remaining <= 15 && remaining > 0 && !showResult);
    }, 500);

    return () => clearInterval(checkInterval);
  }, [nextSong, audio.duration, audio.getCurrentTime, showResult]);

  const navigateToNextSong = useCallback(() => {
    if (!nextSong || !playlistContext) return;
    audio.cleanup();
    navigate("/playback", {
      replace: true,
      state: {
        song: nextSong.song,
        playlistContext: {
          ...playlistContext,
          currentIndex: nextSong.index,
        },
      },
    });
  }, [nextSong, playlistContext, audio.cleanup, navigate]);

  const handleResultFinish = useCallback(() => {
    audio.cleanup();
    setShowResult(false);

    if (nextSong && playlistContext) {
      navigate("/playback", {
        replace: true,
        state: {
          song: nextSong.song,
          playlistContext: {
            ...playlistContext,
            currentIndex: nextSong.index,
          },
        },
      });
    } else {
      navigate("/", { replace: true });
    }
  }, [audio.cleanup, navigate, nextSong, playlistContext]);

  useEffect(() => {
    if (audio.error) {
      toast.error(audio.error);
      navigate("/", { replace: true });
    }
  }, [audio.error, navigate]);

  const firstSegmentStart = segments.length > 0 ? segments[0].start : 0;
  const lastSegmentEnd = segments.length > 0 ? segments[segments.length - 1].end : 0;

  const handleSkipIntro = useCallback(() => {
    if (segments.length === 0) {
      return;
    }
    const target = Math.max(0, firstSegmentStart - INTRO_SKIP_LEAD_SEC);
    audio.seek(target);
  }, [audio.seek, firstSegmentStart, segments.length]);

  const handleSkipOutro = useCallback(() => {
    audio.pause();
    setSkipOutroPending(true);
  }, [audio.pause]);

  const handlePause = useCallback(() => {
    audio.pause();
    setPaused(true);
  }, [audio.pause]);

  const handleContinue = useCallback(() => {
    setPaused(false);
    audio.resume();
  }, [audio.resume]);

  const handleExit = useCallback(() => {
    audio.cleanup();
    navigate("/", { replace: true });
  }, [audio.cleanup, navigate]);

  usePlaybackInput({
    paused,
    song,
    firstSegmentStart,
    lastSegmentEnd,
    introSkipLeadSec: INTRO_SKIP_LEAD_SEC,
    guideVolume: audio.guideVolume,
    isReady: audio.isReady,
    getCurrentTime: audio.getCurrentTime,
    setGuideVolume: audio.setGuideVolume,
    setThemeIndex,
    setFlavorIndex,
    persistConfig,
    onSkipIntro: handleSkipIntro,
    onSkipOutro: handleSkipOutro,
    handlePause,
    handleContinue,
    onToggleMic: handleToggleMic,
    onCycleMic: handleCycleMic,
    onToggleMicMirror: handleToggleMicMirror,
    onToggleScript: toggleScript,
    onToggleMultiSinger: canUseMultiSinger ? () => setMultiSingerMode((prev) => !prev) : undefined,
  });

  const videoFlavor: VideoFlavor = FLAVORS[flavorIndex % FLAVORS.length];

  return (
    <div className="fixed inset-0 overflow-hidden bg-black" style={{ contain: "strict" }}>
      <Background
        themeIndex={themeIndex}
        videoFlavor={videoFlavor}
        sourceVideoPath={sourceVideoPath}
        sourceVideoTempoRatio={song.tempo}
        isReady={audio.isReady}
        isPlaying={audio.isPlaying}
        subscribe={audio.subscribe}
        getCurrentTime={audio.getCurrentTime}
      />

      {audio.isReady && (
        <>
          <PlaybackHud
            title={song.title}
            artist={song.artist}
            duration={audio.duration}
            guideVolume={audio.guideVolume}
            themeIndex={themeIndex}
            videoFlavor={videoFlavor}
            firstSegmentStart={firstSegmentStart}
            introSkipLeadSec={INTRO_SKIP_LEAD_SEC}
            lastSegmentEnd={lastSegmentEnd}
            onSkipIntro={handleSkipIntro}
            onSkipOutro={handleSkipOutro}
            subscribe={audio.subscribe}
            getCurrentTime={audio.getCurrentTime}
            transcriptSource={transcriptSource}
            pitchScore={
              !useMultiMicMode && micCaptureActive && micPitchActive && micUserEnabled
                ? score
                : null
            }
            micOn={micUserEnabled}
            micName={selectedMicId ?? "Default"}
            micMirrorOn={micMirrorUserEnabled}
            slotScores={slotScoresForHud}
            micSlotCount={micSlotCount}
            micRms={!useMultiMicMode && micCaptureActive ? latestRms : 0}
            slotRms={
              useMultiMicMode ? multiMicSlots.slice(0, micSlotCount).map((s) => s.rms) : null
            }
            hasScriptVariants={availableVariants.length > 0}
            activeScript={activeScript}
            onToggleScript={toggleScript}
            multiSingerEnabled={multiSingerMode}
            canToggleMultiSinger={canUseMultiSinger}
            onToggleMultiSinger={() => setMultiSingerMode((prev) => !prev)}
          />
          {/* Pitch graph(s): show two in multi-singer mode, one otherwise */}
          {multiSingerMode && useMultiMicMode && multiScoringResults.length >= 2 ? (
            <>
              <PitchGraph
                series={multiScoringResults[0]?.series ?? series}
                visible={multiMicSlots.some((s) => s.active) && micUserEnabled}
                refColor={{ r: 51, g: 217, b: 89 }}
                label={multiSingerMeta?.singer_1_label ?? "Singer 1"}
                className="pointer-events-none top-3 absolute left-1/2 z-20 -translate-x-1/2 rounded-sm border-white/15 bg-black/40 p-1"
              />
              <PitchGraph
                series={multiScoringResults[1]?.series ?? series}
                visible={multiMicSlots.some((s) => s.active) && micUserEnabled}
                refColor={{ r: 251, g: 191, b: 36 }}
                label={multiSingerMeta?.singer_2_label ?? "Singer 2"}
                className="pointer-events-none top-16 absolute left-1/2 z-20 -translate-x-1/2 rounded-sm border-white/15 bg-black/40 p-1"
              />
            </>
          ) : (
            <PitchGraph
              series={useMultiMicMode ? (multiScoringResults[0]?.series ?? series) : series}
              visible={
                useMultiMicMode
                  ? multiMicSlots.some((s) => s.active) && micUserEnabled
                  : micCaptureActive && micPitchActive && micUserEnabled
              }
            />
          )}
          <LyricsDisplay
            segments={segments}
            subscribe={audio.subscribe}
            getCurrentTime={audio.getCurrentTime}
            animate={audio.isPlaying && !paused}
          />
        </>
      )}

      <PauseOverlay open={paused && !showResult} onContinue={handleContinue} onExit={handleExit} />

      {/* Next Song preview card – shown in last 15 seconds of playlist playback */}
      {showNextSongPreview && nextSong && (
        <div className="pointer-events-auto fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-white/20 bg-black/70 px-4 py-3 shadow-lg backdrop-blur-md animate-in slide-in-from-right-4 fade-in duration-500">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-white/60">
              Up Next
            </span>
            <span className="text-sm font-medium text-white">{nextSong.song.title}</span>
            <span className="text-xs text-white/50">{nextSong.song.artist}</span>
          </div>
          <button
            onClick={navigateToNextSong}
            className="ml-2 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/25"
          >
            Skip to next →
          </button>
        </div>
      )}

      <ResultDialog
        open={showResult}
        score={resultScore}
        song={song}
        scores={profileData?.scores ?? []}
        activeProfile={profileData?.active ?? null}
        onFinish={handleResultFinish}
      />
    </div>
  );
}
