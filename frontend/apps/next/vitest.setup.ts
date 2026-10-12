import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/dom'

// El valor por defecto (1000 ms) se queda corto en runners lentos (CI): los
// `findBy*` que esperan un menú o diálogo de Base UI fallaban ahí aunque
// pasan en local. Solo es un tope de espera; no ralentiza los tests que pasan.
configure({ asyncUtilTimeout: 5000 })
