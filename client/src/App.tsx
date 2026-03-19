import { BrowserRouter, Routes, Route } from "react-router";

import "./App.css";
import { Menu } from "./pages/menu/menu";
import { Setup } from "./pages/setup/setup";
import { Playback } from "./pages/playback/playback";

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Setup />} />
      <Route path="/menu" element={<Menu />} />
      <Route path="/playback" element={<Playback />} />
    </Routes>
  </BrowserRouter>
)

export default App;
