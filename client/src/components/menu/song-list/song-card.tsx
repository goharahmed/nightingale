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
import { Song } from '@/types/Song';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  AudioLinesIcon,
  FileTextIcon,
  MenuIcon,
  MusicIcon,
  Trash2Icon,
  VideoIcon,
} from 'lucide-react';
import { toast } from 'sonner';

function formatSeconds(seconds: number): string {
  const total = Math.floor(seconds);

  const minutes = Math.floor(total / 60);
  const secs = total % 60;

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
export const SongCard = ({ song }: { song: Song }) => {
  const transcriptSource =
    typeof song.analysis_status === 'object' && 'Ready' in song.analysis_status
      ? song.analysis_status['Ready']
      : null;

  const analysisStatus =
    typeof song.analysis_status === 'string'
      ? song.analysis_status
      : 'Error' in song.analysis_status
        ? 'Error'
        : transcriptSource;

  return (
    <Item
      variant="outline"
      role="listitem"
      className="cursor-pointer transition-colors hover:bg-muted"
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
          {song.language ? ` • ${song.language.toLocaleUpperCase()}` : ''}
        </ItemDescription>
      </ItemContent>
      <ItemContent className="flex flex-col text-center">
        <Badge variant="outline" className="w-full">
          {analysisStatus?.split(/(?=[A-Z])/).join(' ')}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="xs">
              <MenuIcon /> Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => toast.info(`Cache deleted for "${song.title}"`)}
              >
                <Trash2Icon />
                Delete cache
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  toast.info(`Reanalyzing transcript for "${song.title}"`)
                }
              >
                <FileTextIcon />
                Reanalyze transcript
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  toast.info(
                    `Reanalyzing full (with stems) for "${song.title}"`,
                  )
                }
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
