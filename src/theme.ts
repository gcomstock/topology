// JS mirror of the CSS theme tokens (spec §3). The 3D scene reads colors from
// here so it re-themes alongside the DOM. Keep in sync with src/index.css.

export interface Theme {
  bgBase: string
  bgElevated: string
  bgElevated2: string
  border: string
  grid: string
  textPrimary: string
  textMuted: string
  textFaint: string
  accent: string
  accentBlue: string
  healthGood: string
  healthMid: string
  healthBad: string
  warning: string
  nodata: string
  glowGood: string
  glowBad: string
  bloomIntensity: number
  bloomThreshold: number
}

export const darkTheme: Theme = {
  bgBase: '#0a0e14',
  bgElevated: '#0d1117',
  bgElevated2: '#11161f',
  border: '#1c2430',
  grid: '#161b22',
  textPrimary: '#e6edf3',
  textMuted: '#7d8590',
  textFaint: '#484f58',
  accent: '#2dd4bf',
  accentBlue: '#58a6ff',
  healthGood: '#3fb950',
  healthMid: '#d29922',
  healthBad: '#f85149',
  warning: '#e3b341',
  nodata: '#484f58',
  glowGood: '#3fb950',
  glowBad: '#ff6a5e',
  bloomIntensity: 1.1,
  bloomThreshold: 0.72,
}

export const lightTheme: Theme = {
  bgBase: '#ffffff',
  bgElevated: '#f6f8fa',
  bgElevated2: '#eef1f4',
  border: '#d0d7de',
  grid: '#e6e9ec',
  textPrimary: '#1f2328',
  textMuted: '#59636e',
  textFaint: '#8c959f',
  accent: '#0d9488',
  accentBlue: '#0969da',
  healthGood: '#1a7f37',
  healthMid: '#9a6700',
  healthBad: '#cf222e',
  warning: '#9a6700',
  nodata: '#8c959f',
  glowGood: '#1a7f37',
  glowBad: '#cf222e',
  // Light mode is a rough best-guess pass; bloom toned down to avoid washout.
  bloomIntensity: 0.35,
  bloomThreshold: 0.85,
}

export type ThemeName = 'dark' | 'light'

export const themes: Record<ThemeName, Theme> = {
  dark: darkTheme,
  light: lightTheme,
}

// Push the active theme into CSS custom properties on :root so the DOM UI tracks it.
export function applyThemeToDOM(theme: Theme, name: ThemeName) {
  const r = document.documentElement
  const map: Record<string, string> = {
    '--bg-base': theme.bgBase,
    '--bg-elevated': theme.bgElevated,
    '--bg-elevated-2': theme.bgElevated2,
    '--border': theme.border,
    '--grid': theme.grid,
    '--text-primary': theme.textPrimary,
    '--text-muted': theme.textMuted,
    '--text-faint': theme.textFaint,
    '--accent': theme.accent,
    '--accent-blue': theme.accentBlue,
    '--health-good': theme.healthGood,
    '--health-mid': theme.healthMid,
    '--health-bad': theme.healthBad,
    '--warning': theme.warning,
    '--nodata': theme.nodata,
    '--glow-good': theme.glowGood,
    '--glow-bad': theme.glowBad,
  }
  for (const [k, v] of Object.entries(map)) r.style.setProperty(k, v)
  r.dataset.theme = name
}
