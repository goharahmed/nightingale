import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Stars } from "@/components/shared/stars";
import { useAnalysis } from "@/hooks/use-analysis";
import type { QueuedStatus } from "@/types/QueuedStatus";
import type { Song } from "@/types/Song";
import { convertFileSrc } from "@/tauri-bridge/media";
import {
  AlertTriangleIcon,
  AudioLinesIcon,
  CaseSensitiveIcon,
  GripVerticalIcon,
  HeadphonesIcon,
  LanguagesIcon,
  FileTextIcon,
  ImageIcon,
  ListMusicIcon,
  ListPlusIcon,
  LoaderCircleIcon,
  MenuIcon,
  MusicIcon,
  PencilIcon,
  PencilLineIcon,
  PlayIcon,
  SquareIcon,
  Trash2Icon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { memo, MouseEvent, useState, PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDialog } from "@/hooks/use-dialog";
import { Shifts, ShiftType } from "./shifts";
import { useQueryClient } from "@tanstack/react-query";
import { SONGS } from "@/queries/keys";
import {
  usePlaylists,
  useAddSongToPlaylist,
  useRemoveSongFromPlaylist,
} from "@/queries/use-playlists";
import { useCurrentProfile } from "@/hooks/use-current-profile";
import { useLibraryFilter } from "@/hooks/use-library-filter";
import { usePreviewPlayback, PREVIEW_DURATION } from "@/hooks/use-preview-playback";
import { onTransliterationDone } from "@/tauri-bridge/analysis";

function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds) % 60;

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

type StatusInfo = {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
  isAnalyzing?: boolean;
  isReady?: boolean;
};

function getStatusInfo(isAnalyzed: boolean, queueStatus?: QueuedStatus): StatusInfo {
  if (queueStatus) {
    if (queueStatus === "Queued") {
      return { label: "Queued", variant: "secondary" };
    }

    if (typeof queueStatus === "object") {
      if ("Analyzing" in queueStatus) {
        return {
          label: `Analyzing ${queueStatus.Analyzing}%`,
          variant: "default",
          className: "animate-pulse",
          isAnalyzing: true,
        };
      }

      if ("Failed" in queueStatus) {
        return { label: "Failed", variant: "destructive" };
      }
    }
  }

  if (isAnalyzed) {
    return {
      label: "Analyzed",
      variant: "default",
      className: "bg-green-600 text-white",
      isReady: true,
    };
  }

  return { label: "Not Analyzed", variant: "outline" };
}

interface SongCardProps {
  song: Song;
  queueStatus?: QueuedStatus;
  bestScore?: number;
  index: number;
  isFocused: boolean;
  /** When set, the Play button will navigate with playlist context */
  onPlay?: (song: Song) => void;
  /** Pointer-based drag reordering for playlist view */
  isDraggable?: boolean;
  isDragOver?: "above" | "below" | false;
  onGripPointerDown?: (e: ReactPointerEvent<HTMLDivElement>, index: number) => void;
}

export const SongCard = memo(
  ({
    song,
    queueStatus,
    bestScore,
    index,
    isFocused,
    onPlay,
    isDraggable,
    isDragOver,
    onGripPointerDown,
  }: SongCardProps) => {
    const [shifting, setShifting] = useState<Record<ShiftType, boolean>>({
      tempo: false,
      key: false,
    });

    const navigate = useNavigate();
    const { setMode } = useDialog();
    const queryClient = useQueryClient();
    const { enqueueOne, deleteSongCache, reanalyzeFull, generateTransliteration } = useAnalysis();
    const { playlist_id } = useLibraryFilter();
    const {
      currentHash,
      isPlaying: isPreviewing,
      elapsed,
      startPreview,
      stopPreview,
    } = usePreviewPlayback();
    const isThisPreviewing = currentHash === song.file_hash && isPreviewing;
    const profile = useCurrentProfile();
    const { data: playlists } = usePlaylists();
    const { mutate: addToPlaylist } = useAddSongToPlaylist();
    const { mutate: removeFromPlaylist } = useRemoveSongFromPlaylist();
    const { label, variant, className, isAnalyzing, isReady } = getStatusInfo(
      song.is_analyzed,
      queueStatus,
    );

    const displaySource = isReady
      ? ` (${song.transcript_source === "Lyrics" ? "Lyrics" : "Generated"})`
      : "";

    const disabled = shifting.tempo || shifting.key;

    const setShiftStatus = (type: ShiftType, isShifting: boolean) => {
      setShifting((prev) => ({ ...prev, [type]: isShifting }));
    };

    const withMenuAction = (action: () => void | Promise<void>) => async (e: MouseEvent) => {
      e.stopPropagation();
      await action();
    };

    return (
      <Item
        variant="outline"
        role="listitem"
        data-song-index={index}
        className={cn(
          "relative flex gap-2 transition-colors hover:bg-muted focus-visible:ring-0 focus-visible:border-border",
          isFocused && "ring-2 ring-primary bg-muted",
          disabled && "bd-muted",
        )}
      >
        {/* Drop indicator line */}
        {isDragOver === "above" && (
          <div className="absolute -top-[5px] left-0 right-0 h-[2px] bg-primary rounded-full z-10" />
        )}
        {isDragOver === "below" && (
          <div className="absolute -bottom-[5px] left-0 right-0 h-[2px] bg-primary rounded-full z-10" />
        )}
        {isDraggable && (
          <div
            className="flex items-center cursor-grab active:cursor-grabbing px-1 text-muted-foreground hover:text-foreground touch-none select-none"
            onPointerDown={onGripPointerDown ? (e) => onGripPointerDown(e, index) : undefined}
          >
            <GripVerticalIcon className="size-4" />
          </div>
        )}
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
          <div className="flex items-center gap-1">
            <Badge variant="outline">
              {song.is_video ? (
                <>
                  <VideoIcon /> Video
                </>
              ) : (
                <>
                  <MusicIcon className="size-3" /> Audio
                </>
              )}
            </Badge>
            <Button
              variant={isThisPreviewing ? "destructive" : "secondary"}
              size="xs"
              className="gap-1"
              title="Sneak peek – play a random 15-second preview"
              onClick={(e) => {
                e.stopPropagation();
                if (isThisPreviewing) {
                  stopPreview();
                } else {
                  startPreview(song);
                }
              }}
            >
              {isThisPreviewing ? (
                <>
                  <SquareIcon className="size-3" /> {Math.ceil(PREVIEW_DURATION - elapsed)}s
                </>
              ) : (
                <>
                  <HeadphonesIcon className="size-3" /> Peek
                </>
              )}
            </Button>
            {isReady && !disabled && (
              <Button
                variant="default"
                size="xs"
                className="gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onPlay) {
                    onPlay(song);
                  } else {
                    navigate("/playback", { state: { song } });
                  }
                }}
              >
                <PlayIcon className="size-3" /> Play
              </Button>
            )}
          </div>
          <ItemTitle className="flex min-w-0 flex-row flex-wrap items-center gap-2">
            <span className="line-clamp-1 min-w-0">{song.title}</span>
            {bestScore != null ? <Stars score={bestScore} size="sm" className="shrink-0" /> : null}
          </ItemTitle>
          <ItemDescription>
            {song.artist} &bull; {song.album} &bull; {formatSeconds(song.duration_secs)}
            {song.language ? (
              <>
                {" • "}
                {song.language.toUpperCase()}
                {song.language_confidence != null && song.language_confidence < 0.7 && (
                  <span title="Low language confidence — consider changing language">
                    <AlertTriangleIcon className="inline size-3 ml-0.5 text-yellow-500" />
                  </span>
                )}
              </>
            ) : (
              ""
            )}
          </ItemDescription>
        </ItemContent>

        <ItemContent className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            {!isReady && !isAnalyzing && !queueStatus ? (
              <Badge
                variant={variant}
                className={cn(
                  className,
                  "cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  enqueueOne(song.file_hash);
                }}
              >
                {label}
              </Badge>
            ) : !isReady ? (
              <Badge variant={variant} className={className}>
                {isAnalyzing && <LoaderCircleIcon className="size-3 animate-spin" />}
                {label}
                {displaySource}
              </Badge>
            ) : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="xs" disabled={disabled}>
                <MenuIcon /> Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="start" className="min-w-56">
              <DropdownMenuGroup>
                {isReady && (
                  <>
                    <DropdownMenuItem
                      onClick={withMenuAction(async () => {
                        await deleteSongCache(song.file_hash);
                        toast.info(`Cache deleted for "${song.title}"`);
                      })}
                    >
                      <Trash2Icon />
                      Delete cache
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={withMenuAction(async () => {
                        setMode({ mode: "reanalyze-language", song });
                      })}
                    >
                      <FileTextIcon />
                      Reanalyze transcript
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={withMenuAction(async () => {
                        reanalyzeFull(song.file_hash);
                        toast.info(`Reanalyzing full (with stems) for "${song.title}"`);
                      })}
                    >
                      <AudioLinesIcon />
                      Reanalyze full (with stems)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={withMenuAction(async () => {
                        setMode({ mode: "language", song });
                      })}
                    >
                      <LanguagesIcon />
                      Change language
                    </DropdownMenuItem>
                    {song.is_analyzed && (
                      <DropdownMenuItem
                        onClick={withMenuAction(async () => {
                          toast.info(`Generating romanized transcript for "${song.title}"...`);
                          await generateTransliteration(song.file_hash);
                          const unlisten = await onTransliterationDone((event) => {
                            if (event.file_hash !== song.file_hash) return;
                            if (event.error) {
                              toast.error(`Romanization failed: ${event.error}`);
                            } else {
                              toast.success(
                                `Romanized transcript ready for "${song.title}". Press [L] during playback to toggle.`,
                              );
                            }
                            unlisten();
                          });
                        })}
                      >
                        <CaseSensitiveIcon />
                        Generate romanized
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={withMenuAction(async () => {
                        setMode({ mode: "edit-metadata", song });
                      })}
                    >
                      <PencilIcon />
                      Edit metadata
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={withMenuAction(async () => {
                        setMode({ mode: "edit-lyrics", song });
                      })}
                    >
                      <PencilLineIcon />
                      Edit lyrics
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem
                  onClick={withMenuAction(async () => {
                    setMode({ mode: "set-thumbnail", song });
                  })}
                >
                  <ImageIcon />
                  Set thumbnail
                </DropdownMenuItem>
                {profile && playlists && playlists.length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <ListPlusIcon />
                      Add to Playlist
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {playlists.map((pl) => (
                        <DropdownMenuItem
                          key={pl.id}
                          onClick={withMenuAction(async () => {
                            addToPlaylist(
                              { playlistId: pl.id, fileHash: song.file_hash },
                              {
                                onSuccess: () => toast.success(`Added to "${pl.name}"`),
                              },
                            );
                          })}
                        >
                          <ListMusicIcon className="size-3.5" />
                          {pl.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {playlist_id && (
                  <DropdownMenuItem
                    onClick={withMenuAction(async () => {
                      removeFromPlaylist({ playlistId: playlist_id, fileHash: song.file_hash });
                    })}
                  >
                    <XIcon />
                    Remove from playlist
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </ItemContent>
        <Shifts
          song={song}
          status={shifting}
          onStart={(type: ShiftType) => {
            setShiftStatus(type, true);
          }}
          onSuccess={(message, type: ShiftType) => {
            toast.success(message);
            queryClient.invalidateQueries({ queryKey: SONGS });
            setShiftStatus(type, false);
          }}
          onError={(message, type: ShiftType) => {
            toast.error(message);
            setShiftStatus(type, false);
          }}
        />
      </Item>
    );
  },
);
