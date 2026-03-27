import type { CacheStats } from "@/types/CacheStats";
import prettyBytes from "pretty-bytes";

export function formatBytes(n: bigint | number) {
  return prettyBytes(n, { binary: true });
}

export function totalUsedBytes(s: CacheStats): bigint {
  return s.songs_bytes + s.videos_bytes + s.models_bytes + s.other_bytes;
}

export function segmentPercent(part: bigint, total: bigint): number {
  if (total === 0n) return 0;
  return (Number(part) / Number(total)) * 100;
}
