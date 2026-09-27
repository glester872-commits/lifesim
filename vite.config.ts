import { defineConfig } from 'vite';

// GitHub Pages sirve el juego en https://glester872-commits.github.io/lifesim/:
// el build (y `npm run preview`, que lo sirve) necesita ese prefijo; `npm run dev` sigue en la raíz.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/lifesim/' : '/',
}));
