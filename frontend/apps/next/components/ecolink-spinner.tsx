'use client'

import { useEffect, useId, useState } from 'react'

// Reemplazo del "Cargando…" genérico (`<p role="status">Cargando…</p>`,
// repetido antes en ~106 pantallas) por una animación basada en el ícono
// real de EcoLink (dos anillos entrelazados: uno verde con una hoja, otro
// azul). Paths/gradientes tomados tal cual de `public/Icono Light1x1.svg`
// (confirmados con diseño, no modificar). Ver diseño aprobado 2026-09-28.
//
// Dos variantes con 50/50 de probabilidad, elegida una sola vez al montar:
// - "enlace": los dos anillos se separan, giran y vuelven a encajar, con un
//   destello (`spark`) en el instante de unión.
// - "pulso": los dos anillos respiran (opacidad + escala) alternados medio
//   ciclo.
//
// Contrato de accesibilidad preservado a propósito (no romper los tests que
// ya buscaban esto en las pantallas migradas): `role="status"` en la raíz +
// el texto de `label` en un `<span className="sr-only">` dentro del propio
// componente.

type SpinnerVariant = 'enlace' | 'pulso'

const CYCLE_MS = 2600

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mediaQuery.matches)

    const handleChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    mediaQuery.addEventListener?.('change', handleChange)
    return () => mediaQuery.removeEventListener?.('change', handleChange)
  }, [])

  return reduced
}

export function EcoLinkSpinner({
  label = 'Cargando…',
  maxSize = 320,
}: {
  label?: string
  /** Ancho máximo del ícono en px -- el ancho real es min(40% del contenedor, maxSize). */
  maxSize?: number
}) {
  const [variant] = useState<SpinnerVariant>(() => (Math.random() < 0.5 ? 'enlace' : 'pulso'))
  const reducedMotion = useReducedMotion()
  const rawId = useId()
  const uid = rawId.replace(/:/g, '')
  const greenGradientId = `es-grad-green-${uid}`
  const blueGradientId = `es-grad-blue-${uid}`

  const greenClass = reducedMotion ? '' : variant === 'enlace' ? 'es-green' : 'es-pulse-a'
  const blueClass = reducedMotion ? '' : variant === 'enlace' ? 'es-blue' : 'es-pulse-b'
  const showSpark = !reducedMotion && variant === 'enlace'

  return (
    <div
      role="status"
      className="ecolink-spinner-root flex w-full flex-1 flex-col items-center justify-center gap-3 py-10"
      style={{ minHeight: '16rem' }}
    >
      <style>{`
        .ecolink-spinner-svg { overflow: visible; display: block; }
        .ecolink-spinner-svg .es-green,
        .ecolink-spinner-svg .es-blue,
        .ecolink-spinner-svg .es-spark,
        .ecolink-spinner-svg .es-pulse-a,
        .ecolink-spinner-svg .es-pulse-b {
          transform-box: fill-box;
          transform-origin: 50% 50%;
        }
        .ecolink-spinner-svg .es-green { animation: esGreen ${CYCLE_MS}ms infinite cubic-bezier(.5,0,.18,1); }
        .ecolink-spinner-svg .es-blue { animation: esBlue ${CYCLE_MS}ms infinite cubic-bezier(.5,0,.18,1); }
        .ecolink-spinner-svg .es-spark { animation: esSpark ${CYCLE_MS}ms infinite cubic-bezier(.5,0,.18,1); }
        .ecolink-spinner-svg .es-pulse-a { animation: esPulse ${CYCLE_MS}ms ease-in-out infinite; }
        .ecolink-spinner-svg .es-pulse-b { animation: esPulse ${CYCLE_MS}ms ease-in-out infinite; animation-delay: ${CYCLE_MS / 2}ms; }

        @keyframes esGreen {
          0%,12%   { transform: translate(-78%,-6%) rotate(-14deg) scale(.9); }
          46%      { transform: translate(4%,1.5%) rotate(3deg) scale(1.04); }
          54%,66%  { transform: translate(0,0) rotate(0) scale(1); }
          100%     { transform: translate(-78%,-6%) rotate(-14deg) scale(.9); }
        }
        @keyframes esBlue {
          0%,12%   { transform: translate(78%,6%) rotate(14deg) scale(.9); }
          46%      { transform: translate(-4%,-1.5%) rotate(-3deg) scale(1.04); }
          54%,66%  { transform: translate(0,0) rotate(0) scale(1); }
          100%     { transform: translate(78%,6%) rotate(14deg) scale(.9); }
        }
        @keyframes esSpark {
          0%,40%   { opacity:0; transform:scale(.6); }
          52%      { opacity:.9; transform:scale(1.25); }
          64%,100% { opacity:0; transform:scale(.6); }
        }
        @keyframes esPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%     { opacity:.3; transform:scale(.88); }
        }

        @media (prefers-reduced-motion: reduce) {
          .ecolink-spinner-svg .es-green,
          .ecolink-spinner-svg .es-blue,
          .ecolink-spinner-svg .es-spark,
          .ecolink-spinner-svg .es-pulse-a,
          .ecolink-spinner-svg .es-pulse-b {
            animation: none;
          }
        }
      `}</style>
      <svg
        className="ecolink-spinner-svg"
        viewBox="0 0 2500 2020"
        style={{ width: `min(40%, ${maxSize}px)`, height: 'auto' }}
        aria-hidden="true"
        data-reduced-motion={reducedMotion ? 'true' : 'false'}
        xmlns="http://www.w3.org/2000/svg"
      >
        <g className={greenClass}>
          <path
            d="M857.669 485C873.955 487.982 889.465 490.688 904.322 493.28C1047.53 518.261 1130.07 532.661 1262.94 682.302C1247.69 686.782 1236.25 689.69 1225.52 692.421C1199.65 699.002 1177.84 704.55 1116.44 728.56C1062.82 751.909 1039.32 767.907 1005.12 791.187C999.952 794.703 994.536 798.39 988.742 802.288C915.976 759.488 906.614 756.098 842.248 740.832H487.578C375.799 740.832 285.184 829.59 285.184 939.078V1299.7C285.184 1409.19 375.799 1497.94 487.578 1497.94H1035C1087.72 1494.54 1130.84 1482.84 1183.43 1381.36C1202.75 1343.03 1214.49 1322.23 1244.14 1290.26C1275.12 1261.01 1295.1 1246.8 1335.7 1225.59C1379.58 1202.48 1406.06 1193.38 1456.18 1183.11C1508.86 1176.81 1538.4 1174.3 1591.1 1172.73C1655.92 1166.65 1691.19 1159.42 1753.5 1144.4C1753.77 1179.76 1751.49 1199.5 1742.42 1234.56C1722.03 1317.6 1702.61 1362.47 1670.62 1443.66C1670.62 1443.66 1510.22 1751.01 1188.24 1750H472.157C224.647 1750 24 1553.46 24 1311.03V923.974C24 681.535 224.647 485 472.157 485H857.669Z"
            fill={`url(#${greenGradientId})`}
          />
        </g>
        <g className={blueClass}>
          <path
            d="M1589.43 1294.29C1465.62 1430.52 1385.13 1490.93 1282.7 1502.67C1304.15 1483.24 1314.73 1471.77 1330.11 1449.91C1391.72 1432.06 1456.35 1389.48 1589.43 1294.29Z"
            fill="#ffffff"
          />
          <path
            d="M1483.69 1732.18C1381.36 1798.83 1312.11 1814.64 1172.33 1819.69C1175.54 1824.73 1249.35 1902.95 1324.7 1949.06C1400.05 1995.17 1407.83 1993.08 1472.1 2005.99C1533.04 2018.22 1558.25 2014.45 1591 2014.45H2080.37C2299.94 2014.45 2477 1804.23 2477 1562.31V1176.51C2477 934.594 2299 738.482 2079.42 738.482C2079.42 738.482 1678.54 723.897 1368.96 738.482C1059.38 753.068 870.096 1058.42 849.669 1189.68C829.242 1320.95 834.917 1295.06 834.236 1362.35C836.542 1359.25 1025.49 1382.01 1047.13 1349.18C1068.77 1316.35 1060.8 1303.53 1068.46 1248.49C1073.82 1213.58 1082.77 1198.94 1097.51 1171.8C1148.79 1068.12 1287.08 988.271 1383 992.548H2035.78C2134.6 992.548 2238.75 1087.93 2238.75 1196.81V1552C2238.75 1660.87 2135.98 1768.88 2037.16 1768.88H1606.02C1578.19 1768.88 1507.17 1744.67 1483.69 1732.18Z"
            fill={`url(#${blueGradientId})`}
          />
        </g>
        {showSpark && <circle className="es-spark" cx="1250" cy="1260" r="90" fill="#eaffcf" />}
        <defs>
          <linearGradient id={greenGradientId} x1="888.76" y1="485" x2="888.76" y2="1750" gradientUnits="userSpaceOnUse">
            <stop stopColor="#51CF34" />
            <stop offset="0.99" stopColor="#2F791E" />
          </linearGradient>
          <radialGradient
            id={blueGradientId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(903.5 1294) rotate(41.5679) scale(1086.65 1391.56)"
          >
            <stop offset="0.149" stopColor="#2D8C6F" />
            <stop offset="0.423" stopColor="#006BCF" />
            <stop offset="1" stopColor="#003A7C" />
          </radialGradient>
        </defs>
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  )
}
