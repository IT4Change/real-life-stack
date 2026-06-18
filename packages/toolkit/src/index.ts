// Utilities
export { cn, getTagColor, getTagAccentColor, getSpacePrimaryColor, getReadableTextColor, getItemColor, getActivePanelGlow, resolveAssetUrl } from "./lib/utils"
export { applyItemListFilter, type ItemListFilter } from "./lib/item-filter"
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
export * from "./components"

// Hooks
export * from "./hooks"
