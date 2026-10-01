import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { AdminLocality } from 'app/features/admin/api'
import { BogotaLocalityMap } from './BogotaLocalityMap'

/**
 * Cuadrado simple alrededor de (cx, cy) -- geometría de prueba, no real.
 */
function square(cx: number, cy: number, size = 0.05): number[][] {
  return [
    [cx - size, cy - size],
    [cx + size, cy - size],
    [cx + size, cy + size],
    [cx - size, cy + size],
    [cx - size, cy - size],
  ]
}

/**
 * Fixture de 20 features, replicando el formato real ya verificado contra
 * el GeoJSON oficial convertido: `properties.LocCodigo` con cero a la
 * izquierda ("01".."20"), `properties.LocNombre`. La localidad "03" (Santa
 * Fe) trae 2 anillos (exterior + interior) -- mismo caso real confirmado al
 * correr `scripts/convert-bogota-localidades-geojson.mjs` contra la fuente
 * oficial, para probar que el componente no lanza excepción con eso.
 */
function buildFixtureGeoJson() {
  const features = Array.from({ length: 20 }, (_, index) => {
    const code = String(index + 1).padStart(2, '0')
    const cx = -74.1 + (index % 5) * 0.08
    const cy = 4.5 + Math.floor(index / 5) * 0.08

    if (code === '03') {
      return {
        type: 'Feature',
        properties: { LocCodigo: code, LocNombre: 'SANTA FE' },
        geometry: {
          type: 'Polygon',
          coordinates: [square(cx, cy, 0.05), square(cx, cy, 0.02)],
        },
      }
    }

    return {
      type: 'Feature',
      properties: { LocCodigo: code, LocNombre: `LOCALIDAD ${code}` },
      geometry: { type: 'Polygon', coordinates: [square(cx, cy)] },
    }
  })

  return { type: 'FeatureCollection', features }
}

/** Localidades de la BD -- `code` SIN cero a la izquierda ("1".."20"), como realmente lo guarda `LocalitySeeder`. */
function buildLocalities(): AdminLocality[] {
  return Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    uuid: `uuid-${index + 1}`,
    municipality_id: 1,
    code: String(index + 1),
    name: index === 2 ? 'Santa Fe' : `Localidad ${index + 1}`,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }))
}

describe('BogotaLocalityMap', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  test('shows a loading state before the GeoJSON fetch resolves', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))

    render(
      <BogotaLocalityMap
        localities={buildLocalities()}
        localityCounts={[]}
        selectedLocalityId={null}
        onSelectLocality={vi.fn()}
      />
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  test('fetches the static GeoJSON asset and renders 19 of the 20 localities as clickable elements (Sumapaz excluded), including the 2-ring Santa Fe fixture', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(buildFixtureGeoJson()), { status: 200 }))

    render(
      <BogotaLocalityMap
        localities={buildLocalities()}
        localityCounts={[{ locality_id: 3, count: 5 }]}
        selectedLocalityId={null}
        onSelectLocality={vi.fn()}
      />
    )

    const localityButtons = await screen.findAllByRole('button')
    expect(localityButtons).toHaveLength(19)
    expect(fetchMock).toHaveBeenCalledWith('/data/bogota-localidades.geojson')
  })

  test('excludes Sumapaz (code 20) from the map -- rural locality with no real collection operations, whose extent also distorted the map proportions', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(buildFixtureGeoJson()), { status: 200 }))

    render(
      <BogotaLocalityMap
        localities={buildLocalities()}
        localityCounts={[]}
        selectedLocalityId={null}
        onSelectLocality={vi.fn()}
      />
    )

    await screen.findAllByRole('button')
    expect(screen.queryByRole('button', { name: /sumapaz|localidad 20/i })).not.toBeInTheDocument()
  })

  test('maps LocCodigo with leading zero against locality.code without it, and calls onSelectLocality with the DB id/name on click', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(buildFixtureGeoJson()), { status: 200 }))
    const onSelectLocality = vi.fn()

    render(
      <BogotaLocalityMap
        localities={buildLocalities()}
        localityCounts={[]}
        selectedLocalityId={null}
        onSelectLocality={onSelectLocality}
      />
    )

    const santaFeButton = await screen.findByRole('button', { name: /santa fe/i })
    fireEvent.click(santaFeButton)

    expect(onSelectLocality).toHaveBeenCalledWith(3, 'Santa Fe')
  })

  test('supports keyboard activation (Enter) on a locality, same as a click', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(buildFixtureGeoJson()), { status: 200 }))
    const onSelectLocality = vi.fn()

    render(
      <BogotaLocalityMap
        localities={buildLocalities()}
        localityCounts={[]}
        selectedLocalityId={null}
        onSelectLocality={onSelectLocality}
      />
    )

    const santaFeButton = await screen.findByRole('button', { name: /santa fe/i })
    fireEvent.keyDown(santaFeButton, { key: 'Enter' })

    expect(onSelectLocality).toHaveBeenCalledWith(3, 'Santa Fe')
  })

  test('renders a locality geographically far from the rest with a real, non-empty path (fitExtent robustness)', async () => {
    // Bug real corregido: un `center`/`scale` fijos a ojo dejaba fuera del
    // viewBox a la localidad geográficamente más alejada del resto (el caso
    // real era Sumapaz, código 20 -- ahora excluida del mapa a propósito, ver
    // el test de exclusión arriba, así que esta prueba de robustez usa OTRA
    // localidad, código 19, para seguir cubriendo que `fitExtent` no recorta
    // ni colapsa una localidad lejana aunque Sumapaz ya no participe del
    // cálculo). La localidad "19" queda ~1 grado más al sur que las demás
    // (agrupadas en un radio de ~0.3 grados) -- confirma que `fitExtent` la
    // sigue dibujando con un `d` real, no vacío/NaN.
    const fixture = buildFixtureGeoJson() as { features: Array<{ properties: Record<string, unknown> }> }
    const farFeature = fixture.features.find((f) => f.properties.LocCodigo === '19')!
    farFeature.geometry = { type: 'Polygon', coordinates: [square(-74.1, 3.5, 0.1)] } as never

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(fixture), { status: 200 }))

    render(
      <BogotaLocalityMap
        localities={buildLocalities()}
        localityCounts={[]}
        selectedLocalityId={null}
        onSelectLocality={vi.fn()}
      />
    )

    const farButton = await screen.findByRole('button', { name: /localidad 19/i })
    expect(farButton.tagName.toLowerCase()).toBe('path')
    const d = farButton.getAttribute('d')
    expect(d).toBeTruthy()
    expect(d).not.toMatch(/NaN/)

    // Sumapaz sigue excluida, y las 19 restantes se dibujan todas -- ninguna
    // se pierde al recalcular la proyección para incluir la más lejana.
    expect(await screen.findAllByRole('button')).toHaveLength(19)
  })

  test('shows an error message when the GeoJSON fetch fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }))

    render(
      <BogotaLocalityMap
        localities={buildLocalities()}
        localityCounts={[]}
        selectedLocalityId={null}
        onSelectLocality={vi.fn()}
      />
    )

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
