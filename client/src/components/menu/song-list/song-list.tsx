import { useBestScoresBySongForActiveProfile } from '@/hooks/use-best-scores-by-song';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { SongCard } from './song-card';
import { Filters } from './filters';
import { Progress } from './progress';
import { useAnalysisQueue, useSongs } from '@/queries/use-songs';
import { useMenuFocus } from '@/contexts/menu-focus-context';
import { useAnalysis } from '@/hooks/use-analysis';
import { useNavigate } from 'react-router';

export const SongList = () => {
  const navigate = useNavigate();
  const { enqueueOne } = useAnalysis();
  const { data: queue } = useAnalysisQueue();
  const { focus, actionsRef, scrollRef } = useMenuFocus();
  const bestBySong = useBestScoresBySongForActiveProfile();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useSongs();

  const songs = useMemo(
    () => data?.pages.flatMap((page) => page.processed) ?? [],
    [data],
  );

  // Register song activation callback and count with MenuFocus context
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const songsRef = useRef(songs);
  songsRef.current = songs;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    actionsRef.current.songCount = songs.length;
  }, [songs.length, actionsRef]);

  useEffect(() => {
    actionsRef.current.onConfirmSong = (index: number) => {
      const song = songsRef.current[index];
      if (!song) return;

      const isAnalyzed = song.is_analyzed;
      const queueStatus = queueRef.current?.entries[song.file_hash];
      const isReady =
        isAnalyzed &&
        (!queueStatus ||
          (typeof queueStatus === 'object' && 'Failed' in queueStatus));

      if (isReady) {
        navigate('/playback', { state: { song } });
      } else if (!queueStatus || queueStatus === 'Queued') {
        enqueueOne(song.file_hash);
      }
    };

    return () => {
      actionsRef.current.onConfirmSong = null;
    };
  }, [actionsRef, navigate, enqueueOne]);

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
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const isSongListActive = focus.active && focus.panel === 'songList';

  return (
    <div className="flex min-h-0 w-full flex-1 justify-center">
      <div className="flex min-h-0 w-3/5 flex-col gap-4 p-4">
        <Filters />
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <Progress />
          <div
            ref={setScrollContainer}
            className="no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-1"
            role="list"
          >
            {songs.map((song, index) => (
              <SongCard
                key={song.file_hash}
                song={song}
                queueStatus={queue?.entries[song.file_hash]}
                bestScore={bestBySong.get(song.file_hash)}
                index={index}
                isFocused={
                  isSongListActive &&
                  !focus.analyzeAllFocused &&
                  focus.songIndex === index
                }
              />
            ))}
            <div ref={sentinelRef} className="h-1 shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
};
