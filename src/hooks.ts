import { useStore } from './store'
import { themes, type Theme } from './theme'

export function useTheme(): Theme {
  const name = useStore((s) => s.themeName)
  return themes[name]
}
