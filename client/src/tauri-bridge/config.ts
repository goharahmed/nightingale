import { AppConfig } from "@/types/AppConfig";
import { invoke } from "@tauri-apps/api/core";

export function getPreloadedConfig(): AppConfig | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.__NIGHTINGALE_APP_CONFIG__;
}

export const loadConfig = async (): Promise<AppConfig> => {
  return await invoke<AppConfig>("load_config");
};

export const saveConfig = async (config: AppConfig): Promise<AppConfig> => {
  return await invoke<AppConfig>("save_config", { config });
};

/** Set or clear the OpenAI API key.  The plaintext key only travels once
 *  from the webview to the Rust backend; it is never returned over IPC. */
export const setOpenaiApiKey = async (key: string | null): Promise<void> => {
  await invoke("set_openai_api_key", { key });
};

/** Set or clear the HuggingFace token for pyannote speaker diarization. */
export const setHfToken = async (key: string | null): Promise<void> => {
  await invoke("set_hf_token", { key });
};
