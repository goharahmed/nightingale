import { BrowserRouter, Routes, Route } from 'react-router';

import './App.css';
import { Toaster } from './components/ui/sonner';
import { Menu } from './pages/menu/menu';
import { Setup } from './pages/setup/setup';
import { Playback } from './pages/playback/playback';
import { ThemeProvider } from './providers/theme/ThemeProvider';

const App = () => (
  <ThemeProvider defaultTheme="dark">
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

export default App;
