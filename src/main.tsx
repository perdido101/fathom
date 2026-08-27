import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource/baloo-2/600.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './ui/theme.css';
import './ui/sfx/register';
import './ui/music/register';
import { attachUiSounds } from './ui/sfx/ui-sounds';

attachUiSounds();

const root = document.getElementById('root');
if (!root) throw new Error('no #root in the document');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
