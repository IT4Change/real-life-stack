// Utilities
export { cn, getTagColor, getTagAccentColor, getSpacePrimaryColor, getReadableTextColor, getItemColor, getActivePanelGlow, resolveAssetUrl } from "./lib/utils"
export {
  focusActiveItemOnce,
  focusVirtualItemOnce,
  focusActiveItemInVisibleAreaOnce,
  selectionFocusScrollMarginBlockEnd,
  type SelectionFocusVisibleArea,
  type SelectionFocusVirtualizer,
} from "./lib/selection-focus"
export { applyItemListFilter, type ItemListFilter } from "./lib/item-filter"
export {
  observeColorScheme,
  resolveColorScheme,
  type ColorScheme,
  type ColorSchemePreference,
} from "./lib/color-scheme"
export {
  loadRuntimeConfig,
  getRuntimeConfig,
  applyBranding,
  DEFAULT_RUNTIME_CONFIG,
  type RuntimeConfig,
  type RuntimeEndpoints,
  type Branding,
} from "./lib/runtime-config"
export {
  CORE_MODULES,
  CORE_MODULE_LAYER,
  composeModules,
  setModuleRegistry,
  isKnownModule,
  resolveSpaceModules,
  resolveActiveModule,
  getModules,
  getModule,
  moduleIds,
  defaultModuleIds,
  displayableModules,
  type ModuleEntry,
  type ModuleFragment,
  type ModuleLayer,
  type ModuleRegistry,
  type ModuleViewProps,
  type ModuleFill,
} from "./lib/module-register"
export {
  resolveIcon,
  registerIcon,
  getIcon,
  iconToDataUrl,
  iconRegistryVersion,
  iconNames,
  DEFAULT_ICON,
  MARKER_ICON_SET,
  type IconData,
} from "./lib/icons"
export {
  createNominatimGeocoder,
  nominatimGeocode,
  createNominatimReverseGeocoder,
  nominatimReverseGeocode,
  type Geocoder,
  type GeocodeResult,
  type ReverseGeocoder,
} from "./lib/geocode"

// Components
export * from "./i18n"

export * from "./components"

// Hooks
export * from "./hooks"
