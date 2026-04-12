/**
 * useMultiPitchScoring – runs independent pitch scoring for up to 4 mic slots.
 *
 * Each slot gets its own PitchStateBuffer and PitchScoring instance so that
 * vocalists are scored independently against the same reference vocal track.
 *
 * The hook returns an array of `{ series, score }` objects, one per slot.
 */

import type { AudioPlayer } from "@/hooks/use-audio-player";
import type { MicSlotState } from "@/hooks/use-multi-mic";
import {
  PITCH_WINDOW_SAMPLES,
  PUSH_INTERVAL_SEC,
  REF_LOOKAHEAD_ENTRIES,
} from "@/lib/pitch/constants";
import { createPitchDetector, detectPitchFromSamplesRef } from "@/lib/pitch/detect";
import {
  computeSingableTime,
  PitchScoring,
  type PitchSeriesWithLookahead,
  PitchStateBuffer,
  pitchSimilarity,
  precomputeRefContour,
  sampleVocalsWindow,
} from "@/lib/pitch/state";
import { useEffect, useRef, useState } from "react";

const MAX_SLOTS = 4;

export interface SlotScoringResult {
  series: PitchSeriesWithLookahead;
  score: number;
}

const emptySeries: PitchSeriesWithLookahead = {
  refPitches: [],
  userPitches: [],
  similarities: [],
  lookaheadRefPitches: [],
};

function makeEmpty(): SlotScoringResult {
  return { series: { ...emptySeries }, score: 0 };
}

export function useMultiPitchScoring(
  audio: AudioPlayer,
  slots: MicSlotState[],
  activeSlotCount: number,
) {
  // Per-slot pitch detection + scoring state
  const detectorsRef = useRef(Array.from({ length: MAX_SLOTS }, () => createPitchDetector()));
  const scratchRef = useRef(
    Array.from({ length: MAX_SLOTS }, () => new Float32Array(PITCH_WINDOW_SAMPLES)),
  );
  const buffersRef = useRef(Array.from({ length: MAX_SLOTS }, () => new PitchStateBuffer()));
  const scoringRef = useRef(Array.from({ length: MAX_SLOTS }, () => new PitchScoring(1)));
  const singableRef = useRef<number | null>(null);
  const contourRef = useRef<(number | null)[] | null>(null);

  const [results, setResults] = useState<SlotScoringResult[]>(() =>
    Array.from({ length: MAX_SLOTS }, makeEmpty),
  );

  // Store latest pitches in refs to avoid re-renders from the pitch subscription
  const pitchesRef = useRef<(number | null)[]>(Array.from({ length: MAX_SLOTS }, () => null));

  // Keep pitchesRef in sync with slot state
  useEffect(() => {
    for (let i = 0; i < MAX_SLOTS; i++) {
      pitchesRef.current[i] = slots[i]?.pitch ?? null;
    }
  });

  // Reset when audio changes
  useEffect(() => {
    if (!audio.isReady || audio.duration <= 0) return;

    const vocals = audio.getVocalsBuffer();
    const singable = vocals ? computeSingableTime(vocals) : audio.duration;
    singableRef.current = singable;
    contourRef.current = vocals ? precomputeRefContour(vocals) : null;

    for (let i = 0; i < MAX_SLOTS; i++) {
      buffersRef.current[i].reset();
      scoringRef.current[i] = new PitchScoring(singable);
    }

    setResults(Array.from({ length: MAX_SLOTS }, makeEmpty));
  }, [audio.isReady, audio.duration]);

  // Scoring loop
  useEffect(() => {
    if (!audio.isReady) return;

    const run = (t: number) => {
      if (t <= 0) return;

      const vocals = audio.getVocalsBuffer();
      let changed = false;

      // Lazily compute contour + singable time when vocals buffer first becomes available
      if (vocals && !contourRef.current) {
        contourRef.current = precomputeRefContour(vocals);
        const singable = computeSingableTime(vocals);
        singableRef.current = singable;
        for (let i = 0; i < MAX_SLOTS; i++) {
          scoringRef.current[i] = new PitchScoring(singable);
        }
      }

      for (let i = 0; i < activeSlotCount; i++) {
        const mp = pitchesRef.current[i];
        const scratch = scratchRef.current[i];
        const buf = buffersRef.current[i];
        const scoring = scoringRef.current[i];
        const detector = detectorsRef.current[i];

        if (!vocals || !sampleVocalsWindow(vocals, t, scratch)) {
          buf.tryPush(null, mp, 0, t);
        } else {
          const refHz = detectPitchFromSamplesRef(detector, scratch, vocals.sampleRate);
          const sim = refHz != null && mp != null ? pitchSimilarity(refHz, mp) : 0;
          buf.tryPush(refHz, mp, sim, t);
          scoring.accumulate(t, refHz, mp, sim);
        }
        changed = true;
      }

      if (changed) {
        // Build lookahead ref pitches from pre-computed contour
        const contour = contourRef.current;
        const lookaheadRefPitches: (number | null)[] = [];
        if (contour) {
          const baseIdx = Math.round(t / PUSH_INTERVAL_SEC);
          for (let j = 1; j <= REF_LOOKAHEAD_ENTRIES; j++) {
            const idx = baseIdx + j;
            lookaheadRefPitches.push(idx < contour.length ? contour[idx] : null);
          }
        }

        setResults(
          Array.from({ length: MAX_SLOTS }, (_, i) => ({
            series: { ...buffersRef.current[i].snapshot(), lookaheadRefPitches },
            score: scoringRef.current[i].score(),
          })),
        );
      }
    };

    return audio.subscribe(run);
  }, [audio, audio.isReady, activeSlotCount]);

  return results;
}
