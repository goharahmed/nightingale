import { Progress as ShadCnProgress } from "@/components/ui/progress";
import { useSongsMeta } from "@/queries/use-songs";

export const Progress = () => {
  const { data: meta } = useSongsMeta();

  if (!meta) {
    return null;
  }

  const { count, processed_count } = meta;

  const isScanning = count !== processed_count;

  if (!isScanning) {
    return;
  }

  return <ShadCnProgress max={count} value={processed_count} />;
};
