export type Word = {
  word: string;
  start: number;
  end: number;
  score?: number;
  estimated?: boolean;
};

export type Segment = {
  text: string;
  start: number;
  end: number;
  words: Word[];
};

export type Transcript = {
  language: string;
  segments: Segment[];
  source?: string;
  /** Script variant identifier, e.g. "roman" for romanized transcripts */
  script?: string;
};

export type AudioPaths = {
  instrumental: string;
  vocals: string;
};

/** Available script variants for a song's transcript */
export type TranscriptVariantInfo = {
  /** Always available if the song is analyzed */
  hasOriginal: boolean;
  /** List of available script variant names, e.g. ["roman"] */
  variants: string[];
};
