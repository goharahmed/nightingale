import type { TimeSubscriber } from '@/hooks/use-audio-player';
import { loadingFragment, shaders } from './shaders';
import { ShaderVisualizer } from './shader-visualizer';
import {
  FLAVORS,
  PixabayVideo,
  SourceVideo,
  type VideoFlavor,
} from './video-background';

export type ThemeMode = 'shader' | 'pixabay' | 'source';

export interface BackgroundProps {
  themeIndex: number;
  videoFlavor: VideoFlavor;
  sourceVideoPath?: string;
  isReady: boolean;
  isPlaying: boolean;
  subscribe: (fn: TimeSubscriber) => () => void;
  getCurrentTime: () => number;
}

const SHADER_COUNT = shaders.length;
const PIXABAY_INDEX = SHADER_COUNT;
export const SOURCE_VIDEO_INDEX = SHADER_COUNT + 1;

export function themeMode(index: number): ThemeMode {
  if (index === PIXABAY_INDEX) {
    return 'pixabay';
  }

  if (index === SOURCE_VIDEO_INDEX) {
    return 'source';
  }

  return 'shader';
}

export function themeName(index: number, videoFlavor: VideoFlavor): string {
  const mode = themeMode(index);

  if (mode === 'source') {
    return 'Source Video';
  }

  if (mode === 'pixabay') {
    const name = videoFlavor.charAt(0).toUpperCase() + videoFlavor.slice(1);

    return `Video — ${name}`;
  }

  return shaders[index % SHADER_COUNT].name;
}

export function themeCount(hasSourceVideo: boolean): number {
  return SHADER_COUNT + 1 + (hasSourceVideo ? 1 : 0);
}

export function nextThemeIndex(
  current: number,
  hasSourceVideo: boolean,
): number {
  return (current + 1) % themeCount(hasSourceVideo);
}

export function nextFlavorIndex(current: number): number {
  return (current + 1) % FLAVORS.length;
}

export function isPixabayTheme(index: number): boolean {
  return index === PIXABAY_INDEX;
}

function backgroundContent(
  mode: ThemeMode,
  props: {
    themeIndex: number;
    videoFlavor: VideoFlavor;
    sourceVideoPath?: string;
    isPlaying: boolean;
    subscribe: BackgroundProps['subscribe'];
    getCurrentTime: BackgroundProps['getCurrentTime'];
  },
) {
  const {
    themeIndex,
    videoFlavor,
    sourceVideoPath,
    isPlaying,
    subscribe,
    getCurrentTime,
  } = props;

  switch (mode) {
    case 'shader':
      return (
        <ShaderVisualizer
          shaderIndex={themeIndex % SHADER_COUNT}
          isPlaying={isPlaying}
        />
      );
    case 'pixabay':
      return <PixabayVideo flavor={videoFlavor} isPlaying={isPlaying} />;
    case 'source':
      if (!sourceVideoPath) {
        return null;
      }
      return (
        <SourceVideo
          filePath={sourceVideoPath}
          isPlaying={isPlaying}
          subscribe={subscribe}
          getCurrentTime={getCurrentTime}
        />
      );
  }
}

export const Background = ({
  themeIndex,
  videoFlavor,
  sourceVideoPath,
  isReady,
  isPlaying,
  subscribe,
  getCurrentTime,
}: BackgroundProps) => {
  const mode = themeMode(themeIndex);

  if (!isReady) {
    return (
      <div className="fixed inset-0">
        <ShaderVisualizer
          shaderIndex={0}
          isPlaying={true}
          customFragment={loadingFragment}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0">
      {backgroundContent(mode, {
        themeIndex,
        videoFlavor,
        sourceVideoPath,
        isPlaying: isReady && isPlaying,
        subscribe,
        getCurrentTime,
      })}
    </div>
  );
};
