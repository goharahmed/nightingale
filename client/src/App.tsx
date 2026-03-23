import { BrowserRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './App.css';
import { Toaster } from './components/ui/sonner';
import { Menu } from './pages/menu/menu';
import { Playback } from './pages/playback/playback';
import { ThemeProvider } from './providers/theme/ThemeProvider';
import { useConfig } from './queries/use-config';
import { Setup } from './components/menu/dialogs/setup';

const queryClient = new QueryClient();

const InnerWrapper = () => (
  <>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Menu />} />
        <Route path="/playback" element={<Playback />} />
      </Routes>
    </BrowserRouter>
    <Toaster />
    <Setup />
  </>
);

const ThemeWrapper = () => {
  const { data: config } = useConfig();

  return (
    <ThemeProvider
      defaultTheme={config?.dark_mode === false ? 'light' : 'dark'}
    >
      <InnerWrapper />
    </ThemeProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeWrapper />
  </QueryClientProvider>
);

export default App;
