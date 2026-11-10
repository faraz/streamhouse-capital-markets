import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

/**
 * Every React Bits component checks prefers-reduced-motion and quietly does nothing when
 * it is set. On a borrowed venue machine or a laptop with the accessibility setting on,
 * that would delete the whole motion layer seconds before the talk, with no symptom
 * except a screen that looks broken-flat.
 *
 * So the query is answered false for this page only, before any component mounts. The
 * components stay exactly as shipped. This is a presentation surface the presenter drives
 * on their own hardware, not a page a stranger lands on.
 */
const REDUCED = '(prefers-reduced-motion: reduce)';
const nativeMatchMedia = window.matchMedia.bind(window);
window.matchMedia = ((q: string) => {
  if (!q.includes('prefers-reduced-motion')) return nativeMatchMedia(q);
  const list = nativeMatchMedia(REDUCED);
  return {
    media: q,
    matches: false,
    onchange: null,
    addEventListener: list.addEventListener.bind(list),
    removeEventListener: list.removeEventListener.bind(list),
    addListener: list.addListener?.bind(list),
    removeListener: list.removeListener?.bind(list),
    dispatchEvent: () => false,
  } as MediaQueryList;
}) as typeof window.matchMedia;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
