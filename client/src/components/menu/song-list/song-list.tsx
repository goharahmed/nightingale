import { ItemGroup } from '@/components/ui/item';
import { Song } from './types';
import { SongCard } from './song-card';

const music: Song[] = [
  {
    title: 'Midnight City Lights',
    artist: 'Neon Dreams',
    album: 'Electric Nights',
    duration: '3:45',
  },
  {
    title: 'Coffee Shop Conversations',
    artist: 'The Morning Brew',
    album: 'Urban Stories',
    duration: '4:05',
  },
  {
    title: 'Digital Rain',
    artist: 'Cyber Symphony',
    album: 'Binary Beats',
    duration: '3:30',
  },
];

export const SongList = () => {
  return (
    <ItemGroup className="gap-4">
      {music.map((song) => (
        <SongCard key={song.title} song={song} />
      ))}
    </ItemGroup>
  );
};
