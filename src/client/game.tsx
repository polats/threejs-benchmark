import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './react/App';

// React entry for the expanded `game` view. Mounts the HUD shell, which renders
// the Three.js (React-Three-Fiber) canvas.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
