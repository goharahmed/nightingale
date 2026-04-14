import type { MetadataCorrection } from "@/types/MetadataCorrection";
import type { MetadataFixStatus } from "@/types/MetadataFixStatus";
import { invoke } from "@tauri-apps/api/core";

/** Kick off the AI-powered metadata fix for all songs with bad metadata.
 *  Runs in the background — poll `getMetadataFixStatus` for progress. */
export const startMetadataFix = async (): Promise<void> => {
  await invoke("start_metadata_fix");
};

/** Cancel a running metadata fix. */
export const cancelMetadataFix = async (): Promise<void> => {
  await invoke("cancel_metadata_fix");
};

/** Poll the progress of a running metadata fix. */
export const getMetadataFixStatus = async (): Promise<MetadataFixStatus> => {
  return await invoke<MetadataFixStatus>("get_metadata_fix_status");
};

/** Load all pending (unconfirmed, non-rejected) corrections for review. */
export const getPendingCorrections = async (): Promise<MetadataCorrection[]> => {
  return await invoke<MetadataCorrection[]>("get_pending_corrections");
};

/** Load all corrections regardless of status. */
export const getAllCorrections = async (): Promise<MetadataCorrection[]> => {
  return await invoke<MetadataCorrection[]>("get_all_corrections");
};

/** Confirm a single correction and optionally write to the actual file. */
export const confirmCorrection = async (
  correctionId: number,
  writeToFile: boolean,
): Promise<void> => {
  await invoke("confirm_metadata_correction", { correctionId, writeToFile });
};

/** Reject a correction so it won't be shown again. */
export const rejectCorrection = async (correctionId: number): Promise<void> => {
  await invoke("reject_metadata_correction", { correctionId });
};

/** Write all confirmed (but not yet applied) corrections to actual files. */
export const applyConfirmedToFiles = async (): Promise<number> => {
  return await invoke<number>("apply_confirmed_corrections_to_files");
};
