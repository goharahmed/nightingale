import { useBestScoresBySongForActiveProfile } from "@/hooks/use-best-scores-by-song";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  PointerEvent as ReactPointerEvent,
} from "react";
import { SongCard } from "./song-card";
import { FolderHeader } from "./folder-header";
import { PlaylistHeader } from "./playlist-header";
import { Filters } from "./filters";
import { Progress } from "./progress";
import { useAnalysisQueue, useSongs } from "@/queries/use-songs";
import { usePlaylists, useReorderPlaylistSongs } from "@/queries/use-playlists";
import { useMenuFocus } from "@/contexts/menu-focus-context";
import { useLibraryFilter } from "@/hooks/use-library-filter";
import { useSearch } from "@/hooks/use-search";
import { useNavigate } from "react-router";
import type { Song } from "@/types/Song";
import type { PlaylistContext } from "@/pages/playback/playback";

export const SongList = () => {
  const navigate = useNavigate();
  const { data: queue } = useAnalysisQueue();
  const { focus, actionsRef, scrollRef, setFocus } = useMenuFocus();
  const { search } = useSearch();
  const { artist, album, query, folder_path, playlist_id } = useLibraryFilter();
  const bestBySong = useBestScoresBySongForActiveProfile();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useSongs();
  const { data: playlists } = usePlaylists();
  const { mutate: reorderSongs } = useReorderPlaylistSongs();

  // Pointer-based drag state for playlist reordering
  const [dragState, setDragState] = useState<{
    fromIndex: number;
    overIndex: number;
    position: "above" | "below";
  } | null>(null);
  const dragRef = useRef<{ fromIndex: number; pointerId: number } | null>(null);
  const cardRectsRef = useRef<DOMRect[]>([]);

  // Active playlist (if any)
  const activePlaylist = useMemo(
    () => (playlist_id ? playlists?.find((p) => p.id === playlist_id) : undefined),
    [playlist_id, playlists],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setFocus((prev) => ({ ...prev, songIndex: 0 }));
  }, [search, artist, album, query, folder_path, playlist_id, scrollRef, setFocus]);

  const songs = useMemo(() => data?.pages.flatMap((page) => page.processed) ?? [], [data]);

  // Register song activation callback and count with MenuFocus context
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const songsRef = useRef(songs);
  songsRef.current = songs;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    actionsRef.current.songCount = songs.length;
  }, [songs.length, actionsRef]);

  // Build playlist context for playback navigation
  const buildPlaylistState = useCallback(
    (targetSong: Song, index: number): { song: Song; playlistContext?: PlaylistContext } => {
      if (!activePlaylist || !playlist_id) {
        return { song: targetSong };
      }
      return {
        song: targetSong,
        playlistContext: {
          playlistId: playlist_id,
          playlistName: activePlaylist.name,
          songs: songsRef.current,
          currentIndex: index,
          playMode: activePlaylist.play_mode,
        },
      };
    },
    [activePlaylist, playlist_id],
  );

  const onPlayFromPlaylist = useCallback(
    (targetSong: Song) => {
      const index = songsRef.current.findIndex((s) => s.file_hash === targetSong.file_hash);
      navigate("/playback", { state: buildPlaylistState(targetSong, Math.max(0, index)) });
    },
    [navigate, buildPlaylistState],
  );

  useEffect(() => {
    actionsRef.current.onConfirmSong = (index: number) => {
      const song = songsRef.current[index];
      if (!song) return;

      const isAnalyzed = song.is_analyzed;
      const queueStatus = queueRef.current?.entries[song.file_hash];
      const isReady =
        isAnalyzed &&
        (!queueStatus || (typeof queueStatus === "object" && "Failed" in queueStatus));

      if (isReady) {
        navigate("/playback", { state: buildPlaylistState(song, index) });
      }
    };

    return () => {
      actionsRef.current.onConfirmSong = null;
    };
  }, [actionsRef, navigate, buildPlaylistState]);

  // ── Pointer-based drag-to-reorder for playlists ─────────────────
  const handleGripPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, idx: number) => {
      // Only primary button
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const grip = e.currentTarget;
      grip.setPointerCapture(e.pointerId);
      dragRef.current = { fromIndex: idx, pointerId: e.pointerId };

      // Snapshot card positions from the DOM
      const container = scrollRef.current;
      if (!container) return;
      const cards = container.querySelectorAll<HTMLElement>("[data-song-index]");
      const rects: DOMRect[] = [];
      cards.forEach((card) => {
        const i = Number(card.dataset.songIndex);
        rects[i] = card.getBoundingClientRect();
      });
      cardRectsRef.current = rects;

      const onPointerMove = (ev: globalThis.PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const y = ev.clientY;
        let closest = idx;
        let pos: "above" | "below" = "above";
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (!r) continue;
          const mid = r.top + r.height / 2;
          if (y < mid) {
            closest = i;
            pos = "above";
            break;
          }
          closest = i;
          pos = "below";
        }
        setDragState({ fromIndex: drag.fromIndex, overIndex: closest, position: pos });
      };

      const onPointerUp = () => {
        const drag = dragRef.current;
        dragRef.current = null;
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);

        if (!drag || !playlist_id) {
          setDragState(null);
          return;
        }

        // Read final state synchronously before clearing
        setDragState((prev) => {
          if (!prev || prev.fromIndex === prev.overIndex) return null;

          let dropIdx = prev.overIndex;
          // Adjust: if dropping "below" an item, insert after it
          if (prev.position === "below") dropIdx += 1;
          // If the source was before the target, removing it shifts indices down
          if (prev.fromIndex < dropIdx) dropIdx -= 1;

          if (dropIdx === prev.fromIndex) return null;

          const reordered = [...songsRef.current];
          const [moved] = reordered.splice(prev.fromIndex, 1);
          reordered.splice(dropIdx, 0, moved);

          reorderSongs({
            playlistId: playlist_id,
            fileHashes: reordered.map((s) => s.file_hash),
          });

          return null;
        });
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [playlist_id, reorderSongs, scrollRef],
  );

  // ── Play All handler ──────────────────────────────────────────
  const onPlayAll = useCallback(() => {
    if (!activePlaylist || !playlist_id) return;
    const allSongs = songsRef.current;
    if (allSongs.length === 0) return;

    let startIndex: number;
    if (activePlaylist.play_mode === "Random") {
      startIndex = Math.floor(Math.random() * allSongs.length);
    } else {
      startIndex = 0;
    }

    const song = allSongs[startIndex];
    if (!song) return;

    navigate("/playback", {
      state: {
        song,
        playlistContext: {
          playlistId: playlist_id,
          playlistName: activePlaylist.name,
          songs: allSongs,
          currentIndex: startIndex,
          playMode: activePlaylist.play_mode,
        } satisfies PlaylistContext,
      },
    });
  }, [activePlaylist, playlist_id, navigate]);

  const setScrollContainer = useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef.current = el;
    },
    [scrollRef],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const isSongListActive = focus.active && focus.panel === "songList";

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex w-full justify-center px-4 pt-4">
        <div className="w-full md:w-11/12 lg:w-4/5 xl:w-3/5">
          <Filters />
        </div>
      </div>
      <div className="flex w-full justify-center px-4">
        <div className="w-full md:w-11/12 lg:w-4/5 xl:w-3/5">
          <Progress />
        </div>
      </div>
      {folder_path && (
        <div className="flex w-full justify-center px-4">
          <div className="w-full md:w-11/12 lg:w-4/5 xl:w-3/5">
            <FolderHeader />
          </div>
        </div>
      )}
      {playlist_id && (
        <div className="flex w-full justify-center px-4">
          <div className="w-full md:w-11/12 lg:w-4/5 xl:w-3/5">
            <PlaylistHeader onPlayAll={onPlayAll} />
          </div>
        </div>
      )}
      <div
        ref={setScrollContainer}
        className="no-scrollbar flex min-h-0 flex-1 flex-col items-center gap-2 overflow-auto px-4 py-1"
        role="list"
      >
        <div className="flex w-full flex-col gap-2 md:w-11/12 lg:w-4/5 xl:w-3/5">
          {songs.map((song, index) => (
            <SongCard
              key={song.file_hash}
              song={song}
              queueStatus={queue?.entries[song.file_hash]}
              bestScore={bestBySong.get(song.file_hash)}
              index={index}
              isFocused={isSongListActive && !focus.analyzeAllFocused && focus.songIndex === index}
              onPlay={playlist_id ? onPlayFromPlaylist : undefined}
              isDraggable={!!playlist_id}
              isDragOver={
                dragState && dragState.fromIndex !== index && dragState.overIndex === index
                  ? dragState.position
                  : false
              }
              onGripPointerDown={handleGripPointerDown}
            />
          ))}
          <div ref={sentinelRef} className="h-1 shrink-0" />
        </div>
      </div>
    </div>
  );
};
