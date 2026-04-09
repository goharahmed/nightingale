import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDialog } from "@/hooks/use-dialog";
import {
  searchYouTube,
  downloadYouTubeVideo,
  type YouTubeSearchResult,
} from "@/tauri-bridge/youtube";
import { DownloadIcon, MusicIcon, SearchIcon, VideoIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useSongsMeta } from "@/queries/use-songs";
import { triggerScan } from "@/tauri-bridge/folder";

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

interface VideoItemProps {
  result: YouTubeSearchResult;
  onDownload: (url: string, audioOnly: boolean) => void;
  isDownloading: boolean;
}

const VideoItem = ({ result, onDownload, isDownloading }: VideoItemProps) => {
  const [showOptions, setShowOptions] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
      <div className="flex-shrink-0">
        {!imgError && result.thumbnail ? (
          <img
            src={result.thumbnail}
            alt={result.title}
            className="w-32 h-20 object-cover rounded"
            crossOrigin="anonymous"
            onError={() => {
              console.error("Failed to load thumbnail:", result.thumbnail);
              setImgError(true);
            }}
          />
        ) : (
          <div className="w-32 h-20 bg-muted rounded flex items-center justify-center">
            <VideoIcon className="w-8 h-8 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-medium truncate">{result.title}</h4>
        <p className="text-sm text-muted-foreground truncate">{result.uploader}</p>
        <p className="text-xs text-muted-foreground">{formatDuration(result.duration)}</p>
      </div>
      <div className="flex flex-col gap-2 flex-shrink-0">
        {!showOptions ? (
          <Button
            size="sm"
            onClick={() => setShowOptions(true)}
            disabled={isDownloading}
            className="whitespace-nowrap"
          >
            <DownloadIcon className="w-4 h-4 mr-1" />
            Download
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onDownload(result.url, true);
                setShowOptions(false);
              }}
              disabled={isDownloading}
              className="whitespace-nowrap"
            >
              <MusicIcon className="w-4 h-4 mr-1" />
              Audio
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onDownload(result.url, false);
                setShowOptions(false);
              }}
              disabled={isDownloading}
              className="whitespace-nowrap"
            >
              <VideoIcon className="w-4 h-4 mr-1" />
              Video
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowOptions(false)}
              className="whitespace-nowrap"
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export const YouTubeSearchDialog = () => {
  const { mode, close } = useDialog();
  const queryClient = useQueryClient();
  const { data: meta } = useSongsMeta();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const open = mode === "youtube";

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      return;
    }

    setIsSearching(true);
    try {
      const searchResults = await searchYouTube(query, 20);
      console.log("YouTube search results:", searchResults);
      setResults(searchResults);

      if (searchResults.length === 0) {
        toast.info("No results found");
      } else {
        console.log("First thumbnail URL:", searchResults[0]?.thumbnail);
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Failed to search YouTube");
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const handleDownload = useCallback(
    async (url: string, audioOnly: boolean) => {
      setIsDownloading(true);
      const toastId = toast.loading(`Downloading ${audioOnly ? "audio" : "video"}...`);

      try {
        const result = await downloadYouTubeVideo(url, audioOnly);
        toast.success("Download complete!", {
          id: toastId,
          description: `Downloaded: ${result.title}`,
        });

        // Trigger library rescan to pick up the new file
        setTimeout(() => {
          if (meta?.folder) {
            triggerScan(meta.folder)
              .then(() => {
                // Invalidate queries to refresh the song list
                queryClient.invalidateQueries({ queryKey: ["songs"] });
                queryClient.invalidateQueries({ queryKey: ["songsMeta"] });
              })
              .catch((err: unknown) => {
                console.error("Failed to rescan library:", err);
              });
          }
        }, 1000);
      } catch (error) {
        console.error("Download error:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast.error("Download failed", {
          id: toastId,
          description: errorMessage || "Unknown error",
        });
      } finally {
        setIsDownloading(false);
      }
    },
    [meta, queryClient],
  );

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSearch();
      }
    },
    [handleSearch],
  );

  const handleClose = useCallback(() => {
    setQuery("");
    setResults([]);
    close();
  }, [close]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>YouTube Search & Download</DialogTitle>
          <DialogDescription>
            Search for songs on YouTube and download them to your library
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="search-input" className="sr-only">
                Search
              </Label>
              <Input
                id="search-input"
                placeholder="Search YouTube..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isSearching}
              />
            </div>
            <Button onClick={handleSearch} disabled={isSearching || !query.trim()}>
              <SearchIcon className="w-4 h-4 mr-2" />
              Search
            </Button>
          </div>

          {results.length > 0 && (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-2">
                {results.map((result) => (
                  <VideoItem
                    key={result.id}
                    result={result}
                    onDownload={handleDownload}
                    isDownloading={isDownloading}
                  />
                ))}
              </div>
            </ScrollArea>
          )}

          {isSearching && (
            <div className="text-center text-muted-foreground py-8">Searching...</div>
          )}

          {!isSearching && results.length === 0 && query && (
            <div className="text-center text-muted-foreground py-8">
              No results. Try a different search term.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
