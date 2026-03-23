import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { useAnalysis } from '@/hooks/use-analysis';
import type { QueuedStatus } from '@/types/QueuedStatus';
import type { Song } from '@/types/Song';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  AudioLinesIcon,
  FileTextIcon,
  LoaderCircleIcon,
  MenuIcon,
  MusicIcon,
  Trash2Icon,
  VideoIcon,
} from 'lucide-react';
import { memo } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds) % 60;

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

type StatusInfo = {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className?: string;
  isAnalyzing?: boolean;
  isReady?: boolean;
};

function getStatusInfo(
  isAnalyzed: boolean,
  queueStatus?: QueuedStatus,
): StatusInfo {
  if (queueStatus) {
    if (queueStatus === 'Queued') {
      return { label: 'Queued', variant: 'secondary' };
    }
    if (typeof queueStatus === 'object') {
      if ('Analyzing' in queueStatus) {
        return {
          label: `Analyzing ${queueStatus.Analyzing}%`,
          variant: 'default',
          className: 'animate-pulse',
          isAnalyzing: true,
        };
      }
      if ('Failed' in queueStatus) {
        return { label: 'Failed', variant: 'destructive' };
      }
    }
  }

  if (isAnalyzed) {
    return {
      label: 'Analyzed',
      variant: 'default',
      className: 'bg-green-600 text-white',
      isReady: true,
    };
  }

  return { label: 'Not Analyzed', variant: 'outline' };
}

interface SongCardProps {
  song: Song;
  queueStatus?: QueuedStatus;
}

export const SongCard = memo(({ song, queueStatus }: SongCardProps) => {
  const navigate = useNavigate();
  const { enqueueOne, deleteSongCache, reanalyzeFull, reanalyzeTranscript } =
    useAnalysis();

  const { label, variant, className, isAnalyzing, isReady } = getStatusInfo(
    song.is_analyzed,
    queueStatus,
  );

  const displaySource = isReady
    ? ` (${song.transcript_source === 'Lyrics' ? 'Lyrics' : 'Generated'})`
    : '';

  return (
    <Item
      variant="outline"
      role="listitem"
      className="cursor-pointer transition-colors hover:bg-muted"
      onClick={() => {
        if (isReady) {
          return navigate('/playback', { state: { song } });
        }

        enqueueOne(song.file_hash);
      }}
    >
      <ItemMedia variant="image" className="size-16">
        {song.album_art_path ? (
          <img
            src={convertFileSrc(song.album_art_path)}
            alt={song.title}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <MusicIcon />
        )}
      </ItemMedia>

      <ItemContent>
        {song.is_video && (
          <Badge variant="outline">
            <VideoIcon /> Video
          </Badge>
        )}
        <ItemTitle className="line-clamp-1">{song.title}</ItemTitle>
        <ItemDescription>
          {song.artist} &bull; {song.album} &bull;{' '}
          {formatSeconds(song.duration_secs)}
          {song.language ? ` • ${song.language.toUpperCase()}` : ''}
        </ItemDescription>
      </ItemContent>

      <ItemContent className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          <Badge variant={variant} className={className}>
            {isAnalyzing && (
              <LoaderCircleIcon className="size-3 animate-spin" />
            )}
            {label}
            {displaySource}
          </Badge>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="xs" disabled={!isReady}>
              <MenuIcon /> Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={async (e) => {
                  e.stopPropagation();

                  await deleteSongCache(song.file_hash);
                  toast.info(`Cache deleted for "${song.title}"`);
                }}
              >
                <Trash2Icon />
                Delete cache
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async (e) => {
                  e.stopPropagation();

                  reanalyzeTranscript(song.file_hash);
                  toast.info(`Reanalyzing transcript for "${song.title}"`);
                }}
              >
                <FileTextIcon />
                Reanalyze transcript
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async (e) => {
                  e.stopPropagation();

                  reanalyzeFull(song.file_hash);
                  toast.info(
                    `Reanalyzing full (with stems) for "${song.title}"`,
                  );
                }}
              >
                <AudioLinesIcon />
                Reanalyze full (with stems)
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemContent>
    </Item>
  );
});
