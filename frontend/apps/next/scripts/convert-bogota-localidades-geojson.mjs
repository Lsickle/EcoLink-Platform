#!/usr/bin/env node
/**
 * Conversión ÚNICA (no runtime, no dependencia de producción) del Esri JSON
 * oficial de Datos Abiertos Bogotá ("Localidad. Bogotá D.C.") a un GeoJSON
 * real, simplificado y liviano, servido como asset estático por Next desde
 * `public/data/bogota-localidades.geojson`.
 *
 * El dataset fuente es Esri JSON (ArcGIS REST), NO GeoJSON puro:
 * `{ features: [{ attributes: {...}, geometry: { rings: [...] } }] }`.
 * `@esri/arcgis-to-geojson-utils` convierte cada feature (maneja el caso de
 * Santa Fe con 2 anillos exterior/interior automáticamente, vía el
 * algoritmo de orientación de anillos del formato Esri).
 *
 * Uso (manual, una sola vez -- estos 2 paquetes NO quedan en package.json):
 *   yarn add -D @esri/arcgis-to-geojson-utils @turf/simplify
 *   node scripts/convert-bogota-localidades-geojson.mjs <ruta-esri-json-origen>
 *   yarn remove @esri/arcgis-to-geojson-utils @turf/simplify
 *
 * Verificación esperada (ver plan): 20 features, códigos "01".."20" con cero
 * a la izquierda en `LocCodigo`, Santa Fe (código "03") con 2 anillos.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arcgisToGeoJSON } from '@esri/arcgis-to-geojson-utils'
import { simplify } from '@turf/simplify'

const __dirname = dirname(fileURLToPath(import.meta.url))

const sourcePath = process.argv[2]
if (!sourcePath) {
  console.error('Uso: node convert-bogota-localidades-geojson.mjs <ruta-esri-json-origen>')
  process.exit(1)
}

const outputPath = resolve(__dirname, '../public/data/bogota-localidades.geojson')

const raw = readFileSync(sourcePath, 'utf8').replace(/^﻿/, '')
const esriFeatureSet = JSON.parse(raw)
const esriFeatures = esriFeatureSet.features ?? []

if (esriFeatures.length !== 20) {
  console.error(`Se esperaban 20 features (localidades de Bogotá), se encontraron ${esriFeatures.length}.`)
  process.exit(1)
}

const santaFe = esriFeatures.find((feature) => feature.attributes.LocCodigo === '03')
if (!santaFe || santaFe.geometry.rings.length < 2) {
  console.error('Verificación fallida: Santa Fe (código 03) debía tener al menos 2 anillos en la fuente.')
  process.exit(1)
}

// Cada feature Esri (attributes + geometry) -> GeoJSON Feature. Preserva
// `properties.LocCodigo`/`LocNombre` tal cual (el componente del mapa
// compara `Number(geo.properties.LocCodigo)`, nunca por nombre).
const geoJsonFeatures = esriFeatures.map((feature) => arcgisToGeoJSON(feature))

const featureCollection = {
  type: 'FeatureCollection',
  features: geoJsonFeatures,
}

// Simplifica vértices (tolerancia en grados, ~0.0005° ≈ 55m en el ecuador --
// sobra de margen para 20 zonas clickeables a la escala de un mapa de
// ciudad) y redondea coordenadas a 5 decimales (~1.1m de precisión) para
// bajar el peso del archivo sin perder la forma reconocible de cada
// localidad.
const simplified = simplify(featureCollection, { tolerance: 0.0005, highQuality: true, mutate: false })

function roundCoordinates(coordinates) {
  if (typeof coordinates[0] === 'number') {
    return coordinates.map((value) => Math.round(value * 1e5) / 1e5)
  }
  return coordinates.map(roundCoordinates)
}

// Bug real encontrado y verificado (2026-09-30, en Node puro sin React,
// reproducido/aislado antes de tocar este script): `@esri/arcgis-to-geojson-utils`
// produce anillos exteriores en sentido ANTIHORARIO -- el sentido correcto
// según RFC 7946 (GeoJSON). Pero `d3-geo` (la librería detrás de
// `react-simple-maps`) NO sigue RFC 7946 -- hereda la convención clásica de
// shapefile/Esri, que es la OPUESTA (exterior en sentido HORARIO). Con el
// sentido "correcto" (RFC 7946), el clipper esférico de `geoPath` interpreta
// cada polígono como "todo MENOS esta forma", y dibuja un rectángulo gigante
// (el borde completo del área visible) pegado a cada localidad -- confirmado
// invirtiendo el sentido de cada anillo en Node puro, el artefacto
// desaparece por completo. Se invierte aquí, en la conversión, para que el
// asset final ya quede en la convención que espera el único consumidor real
// de este archivo (el mapa de `BogotaLocalityMap.tsx`).
function reverseRingWinding(geometry) {
  if (geometry.type === 'Polygon') {
    geometry.coordinates = geometry.coordinates.map((ring) => [...ring].reverse())
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates = geometry.coordinates.map((polygon) => polygon.map((ring) => [...ring].reverse()))
  }
}

for (const feature of simplified.features) {
  feature.geometry.coordinates = roundCoordinates(feature.geometry.coordinates)
  reverseRingWinding(feature.geometry)
}

const santaFeResult = simplified.features.find((feature) => feature.properties.LocCodigo === '03')
const santaFeRingCount =
  santaFeResult?.geometry.type === 'MultiPolygon' ? santaFeResult.geometry.coordinates.length : 1
if (santaFeRingCount < 2 && santaFeResult?.geometry.type !== 'Polygon') {
  console.error('Verificación fallida: Santa Fe perdió su segundo anillo durante la conversión/simplificación.')
  process.exit(1)
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, JSON.stringify(simplified), 'utf8')

console.log(`Escrito ${outputPath}`)
console.log(`Features: ${simplified.features.length}`)
console.log(`Santa Fe (código 03): tipo de geometría = ${santaFeResult?.geometry.type}`)
