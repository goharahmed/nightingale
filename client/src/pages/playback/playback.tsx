import {
  Background,
  SOURCE_VIDEO_INDEX,
  nextFlavorIndex,
  nextThemeIndex,
} from '@/components/playback/background';
import { LyricsDisplay } from '@/components/playback/lyrics-display';
import { PauseOverlay } from '@/components/playback/pause-overlay';
import { PlaybackHud } from '@/components/playback/playback-hud';
import {
  FLAVORS,
  type VideoFlavor,
} from '@/components/playback/video-background';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { useConfig } from '@/queries/use-config';
import { loadTranscript } from '@/tauri-bridge/playback';
import { saveConfig } from '@/tauri-bridge/config';
import type { Segment, Transcript } from '@/types/Transcript';
import type { Song } from '@/types/Song';
import type { AppConfig } from '@/types/AppConfig';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';

const INTRO_SKIP_LEAD_SEC = 3;

function splitLongSegments(segments: Segment[], maxWords: number): Segment[] {
  const result: Segment[] = [];
  for (const seg of segments) {
    if (seg.words.length <= maxWords) {
      result.push(seg);
      continue;
    }
    for (let i = 0; i < seg.words.length; i += maxWords) {
      const chunk = seg.words.slice(i, i + maxWords);
      result.push({
        text: chunk.map((w) => w.word).join(' '),
        start: chunk[0].start,
        end: chunk[chunk.length - 1].end,
        words: chunk,
      });
    }
  }
  return result;
}

export const Playback = () => {
  const location = useLocation();
  const { data: config } = useConfig();

  const song = (location.state as { song?: Song } | null)?.song;

  if (!song) {
    return <Navigate to="/" replace />;
  }

  return (
    <PlaybackInner
      key={song.file_hash}
      song={song}
      initialGuideVolume={config?.guide_volume ?? 0.3}
      initialTheme={config?.last_theme ?? 0}
      initialVideoFlavor={config?.last_video_flavor ?? 0}
      config={config ?? null}
    />
  );
};

interface PlaybackInnerProps {
  song: Song;
  initialGuideVolume: number;
  initialTheme: number;
  initialVideoFlavor: number;
  config: AppConfig | null;
}

const PlaybackInner = ({
  song,
  initialGuideVolume,
  initialTheme,
  initialVideoFlavor,
  config,
}: PlaybackInnerProps) => {
  const fileHash = song.file_hash;
  const navigate = useNavigate();

  const [paused, setPaused] = useState(false);
  const [themeIndex, setThemeIndex] = useState(
    song.is_video ? SOURCE_VIDEO_INDEX : initialTheme,
  );
  const [flavorIndex, setFlavorIndex] = useState(initialVideoFlavor);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [transcriptSource, setTranscriptSource] = useState('generated');

  const configRef = useRef(config);
  configRef.current = config;

  const audio = useAudioPlayer(fileHash, initialGuideVolume);

  useEffect(() => {
    loadTranscript(fileHash).then((transcript: Transcript) => {
      setSegments(splitLongSegments(transcript.segments, 8));
      setTranscriptSource(transcript.source ?? 'generated');
    });
  }, [fileHash]);

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

  const persistConfig = useCallback((patch: Partial<AppConfig>) => {
    const current = configRef.current;
    if (!current) return;
    saveConfig({ ...current, ...patch });
  }, []);

  const handleSkipIntro = useCallback(() => {
    if (segments.length === 0) return;
    const target = Math.max(0, firstSegmentStart - INTRO_SKIP_LEAD_SEC);
    audio.seek(target);
  }, [audio, firstSegmentStart, segments.length]);

  const handleSkipOutro = useCallback(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  const handlePause = useCallback(() => {
    audio.pause();
    setPaused(true);
  }, [audio]);

  const handleContinue = useCallback(() => {
    setPaused(false);
    audio.resume();
  }, [audio]);

  const handleExit = useCallback(() => {
    audio.cleanup();
    navigate('/', { replace: true });
  }, [audio, navigate]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (paused) {
          handleContinue();
        } else {
          handlePause();
        }
        return;
      }

      if (paused) return;

      switch (e.key) {
        case 't':
        case 'T':
          setThemeIndex((prev) => {
            const next = nextThemeIndex(prev, song.is_video);
            if (next !== SOURCE_VIDEO_INDEX) {
              persistConfig({ last_theme: next });
            }
            return next;
          });
          break;

        case 'f':
        case 'F':
          setFlavorIndex((prev) => {
            const next = nextFlavorIndex(prev);
            persistConfig({ last_video_flavor: next });
            return next;
          });
          break;

        case 'g':
        case 'G':
          audio.setGuideVolume(audio.guideVolume > 0 ? 0 : 0.3);
          persistConfig({
            guide_volume: audio.guideVolume > 0 ? 0 : 0.3,
          });
          break;

        case '=':
        case '+': {
          const next = Math.min(1, audio.guideVolume + 0.1);
          audio.setGuideVolume(next);
          persistConfig({ guide_volume: next });
          break;
        }

        case '-': {
          const next = Math.max(0, audio.guideVolume - 0.1);
          audio.setGuideVolume(next);
          persistConfig({ guide_volume: next });
          break;
        }

        case 'Enter': {
          if (!audio.isReady) break;
          const t = audio.getCurrentTime();
          if (t < firstSegmentStart - INTRO_SKIP_LEAD_SEC) {
            handleSkipIntro();
          } else if (t > lastSegmentEnd + 1) {
            handleSkipOutro();
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    paused,
    audio,
    song.is_video,
    firstSegmentStart,
    lastSegmentEnd,
    handlePause,
    handleContinue,
    handleSkipIntro,
    handleSkipOutro,
    persistConfig,
  ]);

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
};
