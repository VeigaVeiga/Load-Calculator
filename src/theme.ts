let currentAppTheme: 'dark' | 'light' = 'dark'

export function setCurrentAppTheme(theme: 'dark' | 'light') {
  currentAppTheme = theme
}

export function isLightIndustrialTheme() {
  return currentAppTheme === 'light'
}
