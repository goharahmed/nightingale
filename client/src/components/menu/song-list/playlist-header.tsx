import { useLibraryFilter } from "@/hooks/use-library-filter";
import {
  usePlaylists,
  useDeletePlaylist,
  useRemoveSongFromPlaylist,
} from "@/queries/use-playlists";
import { useDialog } from "@/hooks/use-dialog";
import { EMPTY_LIBRARY_FILTER } from "@/lib/library-menu-filter";
import { ListMusicIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";

export const PlaylistHeader = () => {
  const { playlist_id, setLibraryFilter } = useLibraryFilter();
  const { data: playlists } = usePlaylists();
  const { mutate: deletePlaylist } = useDeletePlaylist();
  const { setMode } = useDialog();

  const playlist = useMemo(
    () => playlists?.find((p) => p.id === playlist_id),
    [playlists, playlist_id],
  );

  if (!playlist) return null;

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
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="Rename playlist"
            onClick={() =>
              setMode({
                mode: "rename-playlist",
                playlistId: playlist.id,
                currentName: playlist.name,
              })
            }
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title="Delete playlist"
            onClick={() => {
              deletePlaylist(playlist.id);
              setLibraryFilter(EMPTY_LIBRARY_FILTER);
            }}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
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

/** Per-song button to remove it from the active playlist */
export const RemoveFromPlaylistButton = ({ fileHash }: { fileHash: string }) => {
  const { playlist_id } = useLibraryFilter();
  const { mutate: removeSong } = useRemoveSongFromPlaylist();

  if (!playlist_id) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      title="Remove from playlist"
      onClick={(e) => {
        e.stopPropagation();
        removeSong({ playlistId: playlist_id, fileHash });
      }}
    >
      <XIcon className="size-3.5" />
    </Button>
  );
};
