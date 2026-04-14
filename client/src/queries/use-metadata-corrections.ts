import { useQuery } from "@tanstack/react-query";
import { METADATA_CORRECTIONS, METADATA_FIX_STATUS } from "./keys";
import { getPendingCorrections, getMetadataFixStatus } from "@/tauri-bridge/metadata-fix";

/** Polls pending metadata corrections for the review UI. */
export const usePendingCorrections = () => {
  return useQuery({
    queryKey: METADATA_CORRECTIONS,
    queryFn: getPendingCorrections,
    refetchInterval: 5000,
  });
};

/** Polls the status of a running metadata fix job. */
export const useMetadataFixStatus = () => {
  return useQuery({
    queryKey: METADATA_FIX_STATUS,
    queryFn: getMetadataFixStatus,
    refetchInterval: 1500,
  });
};
