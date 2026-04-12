import type { AudioPlayer } from "@/hooks/use-audio-player";
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

export function usePitchScoring(audio: AudioPlayer, micPitch: number | null) {
  const refDetector = useRef(createPitchDetector());
  const scratchRef = useRef(new Float32Array(PITCH_WINDOW_SAMPLES));
  const bufferRef = useRef(new PitchStateBuffer());
  const scoringRef = useRef(new PitchScoring(1));
  const micPitchRef = useRef(micPitch);
  const singableRef = useRef<number | null>(null);
  const contourRef = useRef<(number | null)[] | null>(null);
  const [series, setSeries] = useState<PitchSeriesWithLookahead>({
    refPitches: [],
    userPitches: [],
    similarities: [],
    lookaheadRefPitches: [],
  });
  const [score, setScore] = useState(0);

  micPitchRef.current = micPitch;

  useEffect(() => {
    if (!audio.isReady || audio.duration <= 0) {
      return;
    }
    bufferRef.current.reset();

    const vocals = audio.getVocalsBuffer();
    const singable = vocals ? computeSingableTime(vocals) : audio.duration;
    singableRef.current = singable;
    scoringRef.current = new PitchScoring(singable);
    contourRef.current = vocals ? precomputeRefContour(vocals) : null;

    setSeries({ ...bufferRef.current.snapshot(), lookaheadRefPitches: [] });
    setScore(0);
  }, [audio.isReady, audio.duration]);

  useEffect(() => {
    if (!audio.isReady) {
      return;
    }

    const run = (t: number) => {
      if (t <= 0) {
        return;
      }

      const vocals = audio.getVocalsBuffer();
      const mp = micPitchRef.current;

      // Lazily compute contour + singable time when vocals buffer first becomes available
      if (vocals && !contourRef.current) {
        contourRef.current = precomputeRefContour(vocals);
        const singable = computeSingableTime(vocals);
        singableRef.current = singable;
        scoringRef.current = new PitchScoring(singable);
      }

      if (!vocals || !sampleVocalsWindow(vocals, t, scratchRef.current)) {
        bufferRef.current.tryPush(null, mp, 0, t);
      } else {
        const refHz = detectPitchFromSamplesRef(
          refDetector.current,
          scratchRef.current,
          vocals.sampleRate,
        );
        const sim = refHz != null && mp != null ? pitchSimilarity(refHz, mp) : 0;
        bufferRef.current.tryPush(refHz, mp, sim, t);
        scoringRef.current.accumulate(t, refHz, mp, sim);
      }

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

      setSeries({ ...bufferRef.current.snapshot(), lookaheadRefPitches });
      setScore(scoringRef.current.score());
    };

    return audio.subscribe(run);
  }, [audio, audio.isReady]);

  return { series, score };
}
