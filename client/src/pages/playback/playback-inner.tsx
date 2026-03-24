/**
 * Playback session: audio engine, visual background, lyrics HUD, and pause overlay.
 * Route shell (`Playback`) mounts this with a `key` of `file_hash` so state resets per track.
 */

import {
  Background,
  SOURCE_VIDEO_INDEX,
} from '@/components/playback/background';
import { LyricsDisplay } from '@/components/playback/lyrics-display';
import { PauseOverlay } from '@/components/playback/pause-overlay';
import { PitchGraph } from '@/components/playback/pitch-graph';
import { PlaybackHud } from '@/components/playback/playback-hud';
import {
  FLAVORS,
  type VideoFlavor,
} from '@/components/playback/video-background';
import {
  usePlaybackConfigPersist,
  usePlaybackKeyboard,
  usePlaybackTranscript,
} from '@/hooks/playback';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { useMicDevices, useMicPitch } from '@/hooks/use-mic-pitch';
import { usePitchScoring } from '@/hooks/use-pitch-scoring';
import { PROFILES } from '@/queries/keys';
import { useProfiles } from '@/queries/use-profiles';
import { addScore } from '@/tauri-bridge/profile';
import type { Song } from '@/types/Song';
import type { AppConfig } from '@/types/AppConfig';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { INTRO_SKIP_LEAD_SEC } from '@/utils/playback/transcript-segments';

import successSoundUrl from '@/assets/sounds/success.mp3';
import { ResultDialog } from '@/components/playback/dialogs/result';

export interface PlaybackInnerProps {
  song: Song;
  config: AppConfig | null;
}

export function PlaybackInner({ song, config }: PlaybackInnerProps) {
  const fileHash = song.file_hash;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profileData, isLoading: profilesLoading } = useProfiles();

  const [showResult, setShowResult] = useState(false);
  const [resultScore, setResultScore] = useState(0);

  const initialTheme = config?.last_theme ?? 0;
  const initialGuideVolume = config?.guide_volume ?? 0.3;
  const initialVideoFlavor = config?.last_video_flavor ?? 0;

  const [paused, setPaused] = useState(false);
  const [themeIndex, setThemeIndex] = useState(
    song.is_video ? SOURCE_VIDEO_INDEX : initialTheme,
  );
  const [flavorIndex, setFlavorIndex] = useState(initialVideoFlavor);

  const { segments, transcriptSource } = usePlaybackTranscript(fileHash);
  const persistConfig = usePlaybackConfigPersist(config);

  const audio = useAudioPlayer(fileHash, initialGuideVolume);

  const [micUserEnabled, setMicUserEnabled] = useState(
    config?.mic_active ?? true,
  );
  const [selectedMicId, setSelectedMicId] = useState<string | null>(
    config?.preferred_mic ?? null,
  );
  const micDevices = useMicDevices();

  const micEnabled = audio.isReady && audio.isPlaying && !paused && micUserEnabled;
  const {
    latestPitch,
    active: micActive,
    error: micError,
  } = useMicPitch(selectedMicId, micEnabled);
  const { series, score } = usePitchScoring(audio, latestPitch);
  const micErrorShown = useRef(false);
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const finishHandledRef = useRef(false);
  const [skipOutroPending, setSkipOutroPending] = useState(false);

  useEffect(() => {
    if (micError && !micErrorShown.current) {
      micErrorShown.current = true;
      toast.error(`Microphone: ${micError}`);
    }
  }, [micError]);

  const handleToggleMic = useCallback(() => {
    setMicUserEnabled((prev) => {
      const next = !prev;
      persistConfig({ mic_active: next });

      return next;
    });
  }, [persistConfig]);

  const handleCycleMic = useCallback(() => {
    if (micDevices.length <= 1) return;
    const currentIdx = micDevices.findIndex(
      (d) => d.deviceId === selectedMicId,
    );
    const nextIdx = (currentIdx + 1) % micDevices.length;
    const next = micDevices[nextIdx];
    setSelectedMicId(next.deviceId);
    persistConfig({ preferred_mic: next.deviceId });
  }, [micDevices, selectedMicId, persistConfig]);

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
    const shouldShowResult =
      active != null && micUserEnabled && finalScore > 0;

    if (!shouldShowResult) {
      navigate('/', { replace: true });

      return;
    }

    void (async () => {
      try {
        await addScore(fileHash, finalScore);
        await queryClient.invalidateQueries({ queryKey: PROFILES });
        setResultScore(finalScore);
        setShowResult(true);
      } catch (e) {
        toast.error(
          `Could not save score: ${e instanceof Error ? e.message : String(e)}`,
        );
        navigate('/', { replace: true });
      }
    })();
  }, [
    audio.isFinished,
    skipOutroPending,
    fileHash,
    micUserEnabled,
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
    void audioEl.play().catch(() => { });

    return () => {
      audioEl.pause();
      audioEl.src = '';
    };
  }, [showResult]);

  const handleResultFinish = useCallback(() => {
    audio.cleanup();
    setShowResult(false);
    navigate('/', { replace: true });
  }, [audio.cleanup, navigate]);

  useEffect(() => {
    if (audio.error) {
      toast.error(audio.error);
      navigate('/', { replace: true });
    }
  }, [audio.error, navigate]);

  const firstSegmentStart = segments.length > 0 ? segments[0].start : 0;
  const lastSegmentEnd =
    segments.length > 0 ? segments[segments.length - 1].end : 0;

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
    navigate('/', { replace: true });
  }, [audio.cleanup, navigate]);

  usePlaybackKeyboard({
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
  });

  const videoFlavor: VideoFlavor = FLAVORS[flavorIndex % FLAVORS.length];

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black"
      style={{ contain: 'strict' }}
    >
      <Background
        themeIndex={themeIndex}
        videoFlavor={videoFlavor}
        sourceVideoPath={song.is_video ? song.path : undefined}
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
            pitchScore={micActive && micUserEnabled ? score : null}
            micOn={micUserEnabled}
            micName={selectedMicId ?? 'Default'}
          />
          <PitchGraph series={series} visible={micActive && micUserEnabled} />
          <LyricsDisplay
            segments={segments}
            subscribe={audio.subscribe}
            getCurrentTime={audio.getCurrentTime}
          />
        </>
      )}

      <PauseOverlay
        open={paused && !showResult}
        onContinue={handleContinue}
        onExit={handleExit}
      />

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
