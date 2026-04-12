import { useLibraryFilter } from "@/hooks/use-library-filter";
import { usePlaylists, useSetPlaylistPlayMode } from "@/queries/use-playlists";
import { EMPTY_LIBRARY_FILTER } from "@/lib/library-menu-filter";
import { ListMusicIcon, PlayIcon, ShuffleIcon, ListOrderedIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";

interface PlaylistHeaderProps {
  /** Called when "Play All" is clicked – parent (SongList) owns the song list and navigation. */
  onPlayAll?: () => void;
}

export const PlaylistHeader = ({ onPlayAll }: PlaylistHeaderProps) => {
  const { playlist_id, setLibraryFilter } = useLibraryFilter();
  const { data: playlists } = usePlaylists();
  const { mutate: setPlayMode } = useSetPlaylistPlayMode();

  const playlist = useMemo(
    () => playlists?.find((p) => p.id === playlist_id),
    [playlists, playlist_id],
  );

  if (!playlist) return null;

  const isSequential = playlist.play_mode === "Sequential";

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListMusicIcon className="size-4 text-muted-foreground" />
          <span className="font-medium">{playlist.name}</span>
          <span className="text-xs text-muted-foreground">
            {playlist.song_count} {playlist.song_count === 1 ? "song" : "songs"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Sequential / Random toggle */}
          <Button
            variant="outline"
            size="xs"
            className="gap-1.5"
            title={isSequential ? "Switch to Random" : "Switch to Sequential"}
            onClick={() =>
              setPlayMode({
                playlistId: playlist.id,
                mode: isSequential ? "Random" : "Sequential",
              })
            }
          >
            {isSequential ? (
              <>
                <ListOrderedIcon className="size-3.5" /> Sequential
              </>
            ) : (
              <>
                <ShuffleIcon className="size-3.5" /> Random
              </>
            )}
          </Button>
          {/* Play All */}
          {playlist.song_count > 0 && (
            <Button variant="default" size="xs" className="gap-1" onClick={onPlayAll}>
              <PlayIcon className="size-3" /> Play All
            </Button>
          )}
          {/* Close playlist */}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="Close playlist"
            onClick={() => setLibraryFilter(EMPTY_LIBRARY_FILTER)}
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
