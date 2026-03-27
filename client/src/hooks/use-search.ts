import { atom, useAtom } from "jotai";

const searchAtom = atom("");

export const useSearch = () => {
  const [search, setSearch] = useAtom(searchAtom);

  return {
    search,
    setSearch,
  };
};
