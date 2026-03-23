import { BrowserRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './App.css';
import { Toaster } from './components/ui/sonner';
import { Menu } from './pages/menu/menu';
import { Playback } from './pages/playback/playback';
import { ThemeProvider } from './providers/theme/ThemeProvider';
import { useConfig } from './queries/use-config';
import { LoadingScreen } from './components/shared/loading-screen';
import { Setup } from './components/shared/setup';

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
  const { data: config, isLoading, error } = useConfig();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (error) {
    return <div>{error.stack}</div>;
  }

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');

  console.log(gl?.getParameter(debugInfo?.UNMASKED_RENDERER_WEBGL));

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
