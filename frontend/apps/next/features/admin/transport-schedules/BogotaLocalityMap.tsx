'use client'

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import { geoBounds, geoMercator } from 'd3-geo'
import type { GeoJsonObject } from 'geojson'
import type { AdminLocality } from 'app/features/admin/api'
import { EcoLinkSpinner } from '@/components/ecolink-spinner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const GEOJSON_URL = '/data/bogota-localidades.geojson'

// Sumapaz (código 20) se excluye a propósito de este mapa -- es una
// localidad rural enorme (la más grande de las 20 por área, sin operación
// de recolección real) cuya extensión hacia el sur es lo que forzaba la
// proporción tan alta/angosta del mapa completo. Sigue existiendo como
// localidad real en el catálogo (BD/`localities`) -- esto solo filtra qué
// se DIBUJA en este componente, no borra ni desactiva el registro.
const EXCLUDED_LOCALITY_CODES = new Set([20])

// Bug real corregido: Bogotá D.C. (con Sumapaz incluida) es MUCHO más alta
// que ancha (~1:2.4, verificado contra los datos reales) -- usar una caja
// 4:3 fija y forzar `width: 100%` del contenedor (ancho, panel a la
// derecha) hacía que la altura resultante desbordara la pantalla por
// completo. Ahora el viewBox se calcula con la proporción REAL de los
// datos (una sola vez, al cargar el GeoJSON) y el tamaño visual se acota
// por ALTURA disponible en viewport (CSS, ver el `<svg>` más abajo), no
// por ancho del contenedor -- el ancho final se deriva de la proporción.
const MAP_TARGET_HEIGHT = 640
const MAP_MIN_WIDTH = 220
const MAP_MAX_WIDTH = 480
const MAP_PADDING = 24

// Fill por bucket manual de conteo (gris sin datos, 4 tonos de verde
// creciente) -- sin agregar `d3-scale`, solo 20 valores discretos (ver
// plan). No es una escala continua real, es intencional.
const NO_DATA_FILL = '#e2e8f0'
const GREEN_SHADES = ['#bbf7d0', '#86efac', '#4ade80', '#16a34a']
const DEFAULT_STROKE = '#94a3b8'
const SELECTED_STROKE = '#2563eb'

function bucketFill(count: number, maxCount: number): string {
  if (count <= 0 || maxCount <= 0) return NO_DATA_FILL
  const ratio = count / maxCount
  if (ratio <= 0.25) return GREEN_SHADES[0]!
  if (ratio <= 0.5) return GREEN_SHADES[1]!
  if (ratio <= 0.75) return GREEN_SHADES[2]!
  return GREEN_SHADES[3]!
}

export interface LocalityScheduleCount {
  locality_id: number
  count: number
}

export interface BogotaLocalityMapProps {
  /** Catálogo completo de las 20 localidades de Bogotá (sin filtrar) -- resuelve id/nombre por `code`. */
  localities: AdminLocality[]
  /** Conteo de programaciones por localidad para la fecha seleccionada (ver `fetchTransportScheduleLocalitySummary`). */
  localityCounts: LocalityScheduleCount[]
  selectedLocalityId: number | null
  onSelectLocality: (localityId: number, localityName: string) => void
}

/**
 * Mapa clickeable de 19 de las 20 localidades de Bogotá (se excluye Sumapaz
 * a propósito, ver `EXCLUDED_LOCALITY_CODES`) -- SVG puro vía
 * `react-simple-maps`, sin tiles de calles -- para la vista "Programación por
 * Localidad". El GeoJSON real se sirve como asset estático
 * (`public/data/bogota-localidades.geojson`, convertido una sola vez desde
 * el Esri JSON oficial de Datos Abiertos Bogotá -- ver
 * `scripts/convert-bogota-localidades-geojson.mjs`), fetched por este
 * mismo componente (no por `react-simple-maps` internamente) para controlar
 * explícitamente los estados de carga/error.
 *
 * Mapeo de código verificado contra la BD real: el GeoJSON trae
 * `LocCodigo` CON cero a la izquierda ("01".."20"), `localities.code` en
 * la BD NO lo trae ("1".."20") -- comparar siempre por
 * `Number(LocCodigo) === Number(locality.code)`, nunca por string ni por
 * nombre (tildes/mayúsculas inconsistentes entre las dos fuentes).
 *
 * Accesibilidad explícita (react-simple-maps no la da gratis): cada
 * `<Geography>` (un `<path>` SVG) recibe `role="button"`, `tabIndex`,
 * `aria-label` y `onKeyDown` (Enter/Espacio) además de `onClick`.
 */
export function BogotaLocalityMap({
  localities,
  localityCounts,
  selectedLocalityId,
  onSelectLocality,
}: BogotaLocalityMapProps) {
  const [geoJson, setGeoJson] = useState<GeoJsonObject | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // react-simple-maps v5 dejó de dar el API de conveniencia
  // `style={{ default, hover, pressed }}` de versiones anteriores --
  // `GeographyProps.style` es ahora `CSSProperties` plano (ver tipos
  // instalados). El realce de hover se maneja aquí con estado propio.
  const [hoveredCode, setHoveredCode] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    fetch(GEOJSON_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`No se pudo cargar el mapa de localidades (HTTP ${response.status}).`)
        }
        return response.json()
      })
      .then((data: GeoJsonObject) => {
        if (!cancelled) setGeoJson(data)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'No se pudo cargar el mapa de localidades.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // GeoJSON ya filtrado (sin Sumapaz) -- fuente única usada para calcular
  // proporción/proyección y para renderizar, así ambas cosas quedan
  // consistentes entre sí.
  const displayGeoJson = useMemo(() => {
    if (!geoJson) return null
    const collection = geoJson as { type: string; features: Array<{ properties: Record<string, unknown> | null }> }
    if (collection.type !== 'FeatureCollection') return geoJson
    return {
      ...collection,
      features: collection.features.filter((feature) => {
        const code = Number(feature.properties?.LocCodigo)
        return !EXCLUDED_LOCALITY_CODES.has(code)
      }),
    } as GeoJsonObject
  }, [geoJson])

  // Map<code, AdminLocality>, keyed por Number(locality.code) -- construido
  // una sola vez (memo), cada <Geography> resuelve contra este mapa.
  const localityByCode = useMemo(() => {
    const map = new Map<number, AdminLocality>()
    for (const locality of localities) {
      if (locality.code === null || locality.code === undefined || locality.code === '') continue
      map.set(Number(locality.code), locality)
    }
    return map
  }, [localities])

  const countByLocalityId = useMemo(() => {
    const map = new Map<number, number>()
    for (const entry of localityCounts) {
      map.set(entry.locality_id, entry.count)
    }
    return map
  }, [localityCounts])

  const maxCount = useMemo(
    () => localityCounts.reduce((max, entry) => Math.max(max, entry.count), 0),
    [localityCounts]
  )

  // Dimensiones del viewBox calculadas con la proporción REAL de los datos
  // (ancho/alto de la caja delimitadora en grados, aprox. -- suficiente
  // para este mapa local pequeño, sin necesidad de corregir por la
  // distorsión de Mercator en un área tan chica). Alto fijo objetivo, ancho
  // derivado, con límites razonables para que las zonas sigan siendo
  // clickeables cómodamente incluso si la proporción real fuera más
  // cuadrada de lo esperado.
  const { mapWidth, mapHeight } = useMemo(() => {
    if (!displayGeoJson) return { mapWidth: MAP_TARGET_HEIGHT, mapHeight: MAP_TARGET_HEIGHT }
    const bounds = geoBounds(displayGeoJson as Parameters<typeof geoBounds>[0])
    const [[minLon, minLat], [maxLon, maxLat]] = bounds
    const aspect = (maxLon - minLon) / (maxLat - minLat)
    const width = Math.max(MAP_MIN_WIDTH, Math.min(MAP_MAX_WIDTH, MAP_TARGET_HEIGHT * aspect))
    return { mapWidth: width, mapHeight: MAP_TARGET_HEIGHT }
  }, [displayGeoJson])

  // Proyección calculada a partir de la geometría REAL cargada (no un
  // centro/escala fijos a ojo) -- `fitExtent` garantiza que las 20
  // localidades quepan dentro del viewBox con margen, sin recortar
  // ninguna. Bug real corregido: Sumapaz (localidad 20) se extiende mucho
  // más al sur que el resto del casco urbano -- un `scale`/`center` fijo
  // ajustado solo a simple vista para el centro de la ciudad la dejaba
  // fuera del área visible (y potencialmente otras localidades del borde).
  const projection = useMemo(() => {
    if (!displayGeoJson) return undefined
    return geoMercator().fitExtent(
      [
        [MAP_PADDING, MAP_PADDING],
        [mapWidth - MAP_PADDING, mapHeight - MAP_PADDING],
      ],
      displayGeoJson as Parameters<ReturnType<typeof geoMercator>['fitExtent']>[1]
    )
  }, [displayGeoJson, mapWidth, mapHeight])

  if (loadError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError}
      </p>
    )
  }

  if (!displayGeoJson || !projection) {
    return <EcoLinkSpinner label="Cargando mapa…" />
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <TooltipProvider>
        <ComposableMap
          width={mapWidth}
          height={mapHeight}
          projection={projection}
          role="group"
          aria-label="Mapa de localidades de Bogotá"
          className="mx-auto block h-auto max-h-[min(70vh,640px)] w-auto"
        >
          <Geographies geography={displayGeoJson}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const code = Number((geo.properties as Record<string, unknown> | null)?.LocCodigo)
                const locality = localityByCode.get(code)
                const geoName = (geo.properties as Record<string, unknown> | null)?.LocNombre
                const localityName =
                  (typeof geoName === 'string' ? geoName : undefined) ?? locality?.name ?? `Localidad ${code}`
                const count = locality ? (countByLocalityId.get(locality.id) ?? 0) : 0
                const isSelected = locality !== undefined && locality.id === selectedLocalityId
                const isHovered = hoveredCode === code
                const isHighlighted = isSelected || isHovered

                function selectThisLocality() {
                  if (!locality) return
                  onSelectLocality(locality.id, locality.name)
                }

                function handleKeyDown(event: KeyboardEvent<SVGPathElement>) {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectThisLocality()
                  }
                }

                return (
                  <Tooltip key={geo.rsmKey}>
                    {/* `render` (patrón Base UI ya usado en el resto del proyecto, ver
                        components/ui/select.tsx) fusiona las props del trigger
                        directamente sobre el <path> de Geography -- envolverlo en un
                        <span>/<button> normal rompería la estructura del SVG. */}
                    <TooltipTrigger
                      render={
                        <Geography
                          geography={geo}
                          onClick={selectThisLocality}
                          onKeyDown={handleKeyDown}
                          onMouseEnter={() => setHoveredCode(code)}
                          onMouseLeave={() => setHoveredCode((current) => (current === code ? null : current))}
                          onFocus={() => setHoveredCode(code)}
                          onBlur={() => setHoveredCode((current) => (current === code ? null : current))}
                          role="button"
                          tabIndex={locality ? 0 : -1}
                          aria-label={
                            locality
                              ? `${localityName}, ${count} ${count === 1 ? 'programación' : 'programaciones'}`
                              : `${localityName}, sin datos`
                          }
                          aria-pressed={isSelected}
                          style={{
                            fill: bucketFill(count, maxCount),
                            stroke: isHighlighted ? SELECTED_STROKE : DEFAULT_STROKE,
                            strokeWidth: isSelected ? 2 : isHovered ? 1.5 : 0.5,
                            outline: 'none',
                            cursor: locality ? 'pointer' : 'default',
                            transition: 'stroke 120ms ease, stroke-width 120ms ease',
                          }}
                        />
                      }
                    />
                    <TooltipContent>
                      {localityName}
                      {locality ? ` · ${count} ${count === 1 ? 'programación' : 'programaciones'}` : ' · sin datos'}
                    </TooltipContent>
                  </Tooltip>
                )
              })
            }
          </Geographies>
        </ComposableMap>
      </TooltipProvider>
      <p className="text-xs text-muted-foreground">
        Este mapa solo incluye sedes registradas en Bogotá D.C. -- sedes de otras ciudades no aparecen aquí.
      </p>
    </div>
  )
}
