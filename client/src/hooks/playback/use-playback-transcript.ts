/**
 * Loads the transcript for the current track and normalizes segments for display.
 * Supports switching between script variants (e.g. original ↔ romanized) in real-time.
 */

import {
  getTranscriptVariants,
  loadTranscript,
  loadTranscriptVariant,
} from "@/tauri-bridge/playback";
import { onTransliterationDone } from "@/tauri-bridge/analysis";
import type { Segment, Transcript } from "@/types/Transcript";
import { useCallback, useEffect, useRef, useState } from "react";
import { splitLongSegments } from "@/utils/playback/transcript-segments";

export function usePlaybackTranscript(fileHash: string) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [transcriptSource, setTranscriptSource] = useState("generated");
  const [availableVariants, setAvailableVariants] = useState<string[]>([]);
  const [activeScript, setActiveScript] = useState<string | null>(null);

  // Cache transcripts so switching is instant
  const transcriptCache = useRef<Map<string | null, Transcript>>(new Map());

  // Load original transcript and check for variants
  useEffect(() => {
    transcriptCache.current.clear();
    setActiveScript(null);

    loadTranscript(fileHash).then((transcript: Transcript) => {
      transcriptCache.current.set(null, transcript);
      setSegments(splitLongSegments(transcript.segments));
      setTranscriptSource(transcript.source ?? "generated");
    });

    getTranscriptVariants(fileHash).then((variants) => {
      setAvailableVariants(variants);
      // Pre-load variant transcripts into cache for instant switching
      for (const variant of variants) {
        loadTranscriptVariant(fileHash, variant).then((transcript) => {
          transcriptCache.current.set(variant, transcript);
        });
      }
    });
  }, [fileHash]);

  const switchScript = useCallback(
    (script: string | null) => {
      const cached = transcriptCache.current.get(script);
      if (cached) {
        setSegments(splitLongSegments(cached.segments));
        setTranscriptSource(cached.source ?? "generated");
        setActiveScript(script);
        return;
      }

      // If not cached yet, load it
      if (script === null) {
        loadTranscript(fileHash).then((transcript) => {
          transcriptCache.current.set(null, transcript);
          setSegments(splitLongSegments(transcript.segments));
          setTranscriptSource(transcript.source ?? "generated");
          setActiveScript(null);
        });
      } else {
        loadTranscriptVariant(fileHash, script).then((transcript) => {
          transcriptCache.current.set(script, transcript);
          setSegments(splitLongSegments(transcript.segments));
          setTranscriptSource(transcript.source ?? "generated");
          setActiveScript(script);
        });
      }
    },
    [fileHash],
  );

  /** Toggle between original and romanized script */
  const toggleScript = useCallback(() => {
    if (availableVariants.length === 0) return;
    const nextScript = activeScript === null ? availableVariants[0] : null;
    switchScript(nextScript);
  }, [activeScript, availableVariants, switchScript]);

  /** Refresh available variants (call after generating a new transliteration) */
  const refreshVariants = useCallback(() => {
    getTranscriptVariants(fileHash).then((variants) => {
      setAvailableVariants(variants);
      for (const variant of variants) {
        if (!transcriptCache.current.has(variant)) {
          loadTranscriptVariant(fileHash, variant).then((transcript) => {
            transcriptCache.current.set(variant, transcript);
          });
        }
      }
    });
  }, [fileHash]);

  // Listen for transliteration-done events so the toggle button appears
  // dynamically if the user generates a romanized transcript while playing.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    onTransliterationDone((event) => {
      if (event.file_hash === fileHash && !event.error) {
        refreshVariants();
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [fileHash, refreshVariants]);

  return {
    segments,
    transcriptSource,
    availableVariants,
    activeScript,
    switchScript,
    toggleScript,
    refreshVariants,
  };
}
