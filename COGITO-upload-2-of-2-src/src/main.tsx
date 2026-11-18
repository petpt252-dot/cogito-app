import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProvider } from './state';
import { blockTranslation, guardAgainstTranslators, speaksAppLanguage } from './core/domGuard';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './index.css';

guardAgainstTranslators();
if (speaksAppLanguage(navigator.languages)) blockTranslation();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// Offline support: the service worker precaches the built app (production builds only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}

// Ask the browser not to clear the training data under storage pressure (no prompt in most browsers; ignored if
// unsupported). It does not protect against the user clearing site data: backups are still needed.
navigator.storage?.persist?.().catch(() => undefined);
