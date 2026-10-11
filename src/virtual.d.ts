// The virtual modules served by the integration's Vite plugin (src/integration/vite-plugin.ts),
// declared for the package's own typecheck.

declare module 'virtual:@edgekits/astro-i18n/config' {
  const config: import('./types').I18nConfig
  export default config
}

// The consumer's `<generatedDir>/runtime-constants.ts`, or a stub with empty lists.
declare module 'virtual:@edgekits/astro-i18n/runtime-constants' {
  export const NAMESPACE_KEYS: readonly string[]
  export const LOCALES_WITH_TRANSLATIONS: readonly string[]
  export const FULLY_TRANSLATED_LOCALES: readonly string[]
}

// The consumer's `<generatedDir>/fallbacks.generated.ts`, or an empty stub. Its exports
// (`FALLBACK_<NAMESPACE>`) depend on the project's namespaces, so none are declared here:
// the fetcher reads the module namespace by name.
declare module 'virtual:@edgekits/astro-i18n/fallbacks' {
  export {}
}
