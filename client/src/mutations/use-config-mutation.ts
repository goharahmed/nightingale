import { CONFIG } from '@/queries/keys';
import { useConfig } from '@/queries/use-config';
import { saveConfig } from '@/tauri-bridge/config';
import { AppConfig } from '@/types/AppConfig';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export const useConfigMutation = () => {
  const queryClient = useQueryClient();
  const { data: config } = useConfig();

  return useMutation({
    mutationFn: (partialConfig: Partial<AppConfig>) => {
      if (!config) {
        throw new Error("Config not found and can't be updated");
      }

      return saveConfig({ ...config, ...partialConfig });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFIG });
    },
    onError: (error: Error) => {
      toast.error(`Error updating the local config: ${error.message}`);
    },
  });
};
