import { BrowserRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './App.css';
import { Toaster } from './components/ui/sonner';
import { Menu } from './pages/menu/menu';
import { Setup } from './pages/setup/setup';
import { Playback } from './pages/playback/playback';
import { ThemeProvider } from './providers/theme/ThemeProvider';
import { useConfig } from './queries/use-config';
import { LoadingScreen } from './components/shared/loading-screen';

const queryClient = new QueryClient();

const Wrapper = () => {
  const { data: config } = useConfig();

  const { isLoading, error } = useConfig();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (error) {
    return <div>{error.stack}</div>;
  }

  return (
    <ThemeProvider
      defaultTheme={config?.dark_mode === false ? 'light' : 'dark'}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/" element={<Menu />} />
          <Route path="/playback" element={<Playback />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Wrapper />
  </QueryClientProvider>
);

export default App;
