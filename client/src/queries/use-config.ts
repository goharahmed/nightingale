import { loadConfig } from '@/tauri-bridge/loadConfig';
import { useQuery } from '@tanstack/react-query';

export const useConfig = () =>
  useQuery({
    queryKey: ['config'],
    queryFn: loadConfig,
  });
