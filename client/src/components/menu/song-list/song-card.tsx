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
import {
  AudioLinesIcon,
  FileTextIcon,
  MenuIcon,
  Trash2Icon,
  VideoIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Song } from './types';

export const SongCard = ({ song }: { song: Song }) => {
  return (
    <Item
      variant="outline"
      role="listitem"
      className="cursor-pointer transition-colors hover:bg-muted"
    >
      <ItemMedia variant="image" className="size-16">
        <img
          src={`https://avatar.vercel.sh/${song.title}`}
          alt={song.title}
          className="object-cover grayscale"
        />
      </ItemMedia>
      <ItemContent>
        <Badge variant="outline">
          <VideoIcon /> Video
        </Badge>
        <ItemTitle className="line-clamp-1">{song.title}</ItemTitle>
        <ItemDescription>
          {song.artist} • {song.album} • {song.duration} • RU
        </ItemDescription>
      </ItemContent>
      <ItemContent className="flex flex-col text-center">
        <Badge variant="outline" className="w-full">
          Not Analyzed
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
