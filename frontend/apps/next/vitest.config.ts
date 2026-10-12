import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    // Mitigación, no arreglo: en el runner de CI el menú de acciones de
    // Base UI a veces no abre tras el clic sintético (`findByRole('menu')`
    // no lo encuentra) en tests que pasan en local y al reintentar. Causa
    // raíz sin determinar; en local no se reintenta para no ocultarla.
    retry: process.env.CI ? 2 : 0,
    // Cierra el gap de test-location: `packages/app` es lógica compartida
    // sin su propio harness de Vitest -- se corre aquí para poder colocar
    // los tests junto al código de packages/app (convención pedida
    // explícitamente para `roleLabel.ts`, 2026-09-28), sin duplicar
    // configuración en un segundo `vitest.config.ts`.
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)', '../../packages/app/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
  },
})
