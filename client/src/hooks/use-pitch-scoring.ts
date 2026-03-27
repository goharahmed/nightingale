import type { AudioPlayer } from "@/hooks/use-audio-player";
import { PITCH_WINDOW_SAMPLES } from "@/lib/pitch/constants";
import { createPitchDetector, detectPitchFromSamplesRef } from "@/lib/pitch/detect";
import {
  computeSingableTime,
  PitchScoring,
  PitchSeries,
  PitchStateBuffer,
  pitchSimilarity,
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
  const [series, setSeries] = useState<PitchSeries>({
    refPitches: [],
    userPitches: [],
    similarities: [],
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

    setSeries(bufferRef.current.snapshot());
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

      setSeries(bufferRef.current.snapshot());
      setScore(scoringRef.current.score());
    };

    return audio.subscribe(run);
  }, [audio, audio.isReady]);

  return { series, score };
}
