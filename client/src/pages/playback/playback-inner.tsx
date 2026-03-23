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
import type { Song } from '@/types/Song';
import type { AppConfig } from '@/types/AppConfig';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { INTRO_SKIP_LEAD_SEC } from '@/utils/playback/transcript-segments';

export interface PlaybackInnerProps {
  song: Song;
  config: AppConfig | null;
}

export function PlaybackInner({ song, config }: PlaybackInnerProps) {
  const fileHash = song.file_hash;
  const navigate = useNavigate();

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

  useEffect(() => {
    if (audio.isFinished) {
      navigate('/', { replace: true });
    }
  }, [audio.isFinished, navigate]);

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
    if (segments.length === 0) return;
    const target = Math.max(0, firstSegmentStart - INTRO_SKIP_LEAD_SEC);
    audio.seek(target);
  }, [audio.seek, firstSegmentStart, segments.length]);

  const handleSkipOutro = useCallback(() => {
    navigate('/', { replace: true });
  }, [navigate]);

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
          />
          <LyricsDisplay
            segments={segments}
            subscribe={audio.subscribe}
            getCurrentTime={audio.getCurrentTime}
          />
        </>
      )}

      <PauseOverlay
        open={paused}
        onContinue={handleContinue}
        onExit={handleExit}
      />
    </div>
  );
}
