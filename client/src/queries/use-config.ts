import { loadConfig } from '@/tauri-bridge/config';
import { useQuery } from '@tanstack/react-query';
import { CONFIG } from './keys';

export const useConfig = () =>
  useQuery({
    queryKey: CONFIG,
    queryFn: loadConfig,
  });
