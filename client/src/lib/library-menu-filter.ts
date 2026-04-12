import type { LibraryMenuItem } from "@/types/LibraryMenuItem";
import type { LibraryMenuFilters } from "@/types/LibraryMenuFilters";

export type LibraryMenuSection = "hot" | "no_metadata" | "artists" | "albums";

export const EMPTY_LIBRARY_FILTER: LibraryMenuFilters = {
  artist: null,
  album: null,
  query: null,
  folder_path: null,
  folder_recursive: false,
};

const HOT_FILTERS: Record<string, LibraryMenuFilters> = {
  all: { ...EMPTY_LIBRARY_FILTER },
  analysed: { ...EMPTY_LIBRARY_FILTER, query: "analysed" },
  videos: { ...EMPTY_LIBRARY_FILTER, query: "videos" },
};

const NO_METADATA_FILTERS: Record<string, LibraryMenuFilters> = {
  unknown_artist: { ...EMPTY_LIBRARY_FILTER, artist: "unknown_artist" },
  unknown_album: { ...EMPTY_LIBRARY_FILTER, album: "unknown_album" },
};

export function libraryFilterFromMenuSelection(
  section: LibraryMenuSection,
  item: LibraryMenuItem,
): LibraryMenuFilters {
  switch (section) {
    case "hot":
      return HOT_FILTERS[item.value] ?? EMPTY_LIBRARY_FILTER;
    case "no_metadata":
      return NO_METADATA_FILTERS[item.value] ?? EMPTY_LIBRARY_FILTER;
    case "artists":
      return { ...EMPTY_LIBRARY_FILTER, artist: item.value };
    case "albums":
      return { ...EMPTY_LIBRARY_FILTER, album: item.value };
  }
}

export function libraryFiltersEqual(a: LibraryMenuFilters, b: LibraryMenuFilters): boolean {
  return (
    a.artist === b.artist &&
    a.album === b.album &&
    a.query === b.query &&
    a.folder_path === b.folder_path &&
    a.folder_recursive === b.folder_recursive
  );
}

export function isLibraryMenuItemActive(
  section: LibraryMenuSection,
  item: LibraryMenuItem,
  current: LibraryMenuFilters,
): boolean {
  return libraryFiltersEqual(current, libraryFilterFromMenuSelection(section, item));
}
