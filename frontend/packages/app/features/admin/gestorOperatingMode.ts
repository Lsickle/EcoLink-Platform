// Textos de la marca operativo / de referencia de un Gestor.
//
// Viven aquí, y no escritos a mano en cada pantalla, porque la marca se decide
// desde DOS sitios: el formulario de alta (`CreateOrganizationForm`) y el
// detalle de la organización (`OrganizationDetailScreen`). Cuando estaban
// duplicados no había nada que impidiera que se separaran con el tiempo y que
// la misma decisión se explicara distinto según por dónde se llegara.
//
// La distinción no es cosmética: gobierna las dos barreras del cruce en el
// backend (`assertGestorOperatesInPlatform()` / `assertGestorIsReference()`).
// A un Gestor de referencia no se le puede SOLICITAR una evaluación -- no tiene
// usuarios aquí que la resuelvan -- y su resultado solo entra como asignación
// delegada.

export const GESTOR_OPERATING_MODE_LABEL = 'Este Gestor opera dentro de EcoLink'

export const GESTOR_OPERATING_MODE_HINTS = {
  operational: 'Sus usuarios entran a la plataforma y resuelven aquí las evaluaciones que se les soliciten.',
  reference:
    'Gestor de referencia: maneja todo en su propia plataforma y no tiene usuarios aquí. No se le pueden solicitar evaluaciones — su resultado se registra como asignación delegada por EcoLink o por un Subgestor vinculado.',
} as const

export function gestorOperatingModeHint(operatesInPlatform: boolean): string {
  return operatesInPlatform ? GESTOR_OPERATING_MODE_HINTS.operational : GESTOR_OPERATING_MODE_HINTS.reference
}
