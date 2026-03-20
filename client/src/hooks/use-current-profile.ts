import { useProfiles } from '@/queries/use-profiles';

export const useCurrentProfile = (): string | undefined => {
  const { data } = useProfiles();

  if (!data) {
    return;
  }

  const { active, profiles } = data;

  return profiles.find((name) => name === active);
};
