import { useEffect } from 'react';

export default function ThemeProvider({ children }) {
  useEffect(() => {
    const apply = (dark) => document.documentElement.classList.toggle('dark', dark);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mq.matches);
    const handler = (e) => apply(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return children;
}