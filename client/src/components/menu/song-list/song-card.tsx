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
import type { AnalysisStatus } from '@/types/AnalysisStatus';
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
};

function getStatusInfo(status: AnalysisStatus): StatusInfo {
  if (status === 'NotAnalyzed') {
    return { label: 'Not Analyzed', variant: 'outline' };
  }
  if (status === 'Queued') {
    return {
      label: 'Queued',
      variant: 'secondary',
    };
  }
  if (typeof status === 'object') {
    if ('Analyzing' in status) {
      return {
        label: `Analyzing ${status.Analyzing}%`,
        variant: 'default',
        className: 'animate-pulse',
      };
    }
    if ('Ready' in status) {
      const source = status.Ready === 'Lyrics' ? 'Lyrics' : 'Generated';
      return {
        label: `Ready (${source})`,
        variant: 'default',
        className: 'bg-green-600 text-white',
      };
    }
    if ('Failed' in status) {
      return { label: 'Failed', variant: 'destructive' };
    }
  }
  return { label: 'Unknown', variant: 'outline' };
}

export const SongCard = ({ song }: { song: Song }) => {
  let navigate = useNavigate();
  const { enqueueOne, deleteSongCache, reanalyzeFull, reanalyzeTranscript } =
    useAnalysis();

  const { label, variant, className } = getStatusInfo(song.analysis_status);

  const isReady =
    typeof song.analysis_status === 'object' && 'Ready' in song.analysis_status;

  const isAnalyzing =
    typeof song.analysis_status === 'object' &&
    'Analyzing' in song.analysis_status;

  return (
    <Item
      variant="outline"
      role="listitem"
      className="cursor-pointer transition-colors hover:bg-muted"
      onClick={() => {
        if (isReady) {
          return navigate('playback');
        }

        enqueueOne(song.file_hash);
      }}
    >
      <ItemMedia variant="image" className="size-16">
        {song.album_art_path ? (
          <img src={convertFileSrc(song.album_art_path)} alt={song.title} />
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
          {song.artist} • {song.album} • {formatSeconds(song.duration_secs)}
          {song.language ? ` • ${song.language.toUpperCase()}` : ''}
        </ItemDescription>
      </ItemContent>

      <ItemContent className="flex flex-col items-end gap-1">
        <Badge variant={variant} className={className}>
          {isAnalyzing && <LoaderCircleIcon className="size-3 animate-spin" />}
          {label}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="xs"
              disabled={!label.startsWith('Ready')}
            >
              <MenuIcon /> Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={async () => {
                  await deleteSongCache(song.file_hash);
                  toast.info(`Cache deleted for "${song.title}"`);
                }}
              >
                <Trash2Icon />
                Delete cache
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  reanalyzeTranscript(song.file_hash);
                  toast.info(`Reanalyzing transcript for "${song.title}"`);
                }}
              >
                <FileTextIcon />
                Reanalyze transcript
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
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
};
