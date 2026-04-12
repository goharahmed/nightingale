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

/**
 * Pitch scoring for a single microphone.
 *
 * `vocalsBuffer` is decoded by the caller (PlaybackInner) independently of
 * whichever audio player is active so the green reference line works for
 * both regular and multi-channel playback as well as for video files.
 */
export function usePitchScoring(
  audio: AudioPlayer,
  micPitch: number | null,
  vocalsBuffer: AudioBuffer | null,
) {
  const refDetector = useRef(createPitchDetector());
  const scratchRef = useRef(new Float32Array(PITCH_WINDOW_SAMPLES));
  const bufferRef = useRef(new PitchStateBuffer());
  const scoringRef = useRef(new PitchScoring(1));
  const micPitchRef = useRef(micPitch);
  const singableRef = useRef<number | null>(null);
  const contourRef = useRef<(number | null)[] | null>(null);
  const vocalsRef = useRef(vocalsBuffer);
  vocalsRef.current = vocalsBuffer;
  const [series, setSeries] = useState<PitchSeriesWithLookahead>({
    refPitches: [],
    userPitches: [],
    similarities: [],
    lookaheadRefPitches: [],
  });
  const [score, setScore] = useState(0);

  micPitchRef.current = micPitch;

  // --- Reset buffer & scoring when the player becomes ready ---
  useEffect(() => {
    if (!audio.isReady || audio.duration <= 0) return;
    bufferRef.current.reset();
    contourRef.current = null;
    singableRef.current = null;
    scoringRef.current = new PitchScoring(audio.duration);
    setSeries({ ...bufferRef.current.snapshot(), lookaheadRefPitches: [] });
    setScore(0);
  }, [audio.isReady, audio.duration]);

  // --- Compute contour when the vocals buffer arrives ---
  useEffect(() => {
    if (!vocalsBuffer) return;
    console.log("[PitchScoring] Vocals buffer received – computing contour");
    contourRef.current = precomputeRefContour(vocalsBuffer);
    const singable = computeSingableTime(vocalsBuffer);
    singableRef.current = singable;
    scoringRef.current = new PitchScoring(singable);
  }, [vocalsBuffer]);

  // --- Scoring subscriber: runs on each time-tick from the audio player ---
  const subscribe = audio.subscribe;
  useEffect(() => {
    if (!audio.isReady) return;

    const run = (t: number) => {
      if (t <= 0) return;

      const vocals = vocalsRef.current;
      const mp = micPitchRef.current;

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

    return subscribe(run);
  }, [audio.isReady, subscribe]);

  return { series, score };
}
