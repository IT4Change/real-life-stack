import { useCallback, useMemo } from "react"
import { AtSign, Briefcase, Building2, Globe, Home, MapPin, Phone, User } from "lucide-react"
import {
  CollectionView as ToolkitCollectionView,
  CreateFab,
  createInputWidget,
  createMultiInputWidget,
  useCurrentUser,
  useGroups,
  useItemGroupColorResolver,
  useItems,
  useMembers,
  useModulePanel,
  usePersonalGroupId,
  type ContentTypeConfig,
  type CustomWidgetDefinition,
  type ItemEditorMapper,
  type SelectionFocusVisibleArea,
} from "@real-life-stack/toolkit"
import { hasContactData, type Item } from "@real-life-stack/data-interface"
import { useItemFocus } from "../hooks/use-item-focus"
import { useItemDetailEdit } from "../hooks/use-item-detail-edit"
import { useCreate, useRegisterCreate, type CreateConfig } from "../create-host"
import { useRegisterDetail, type DetailConfig } from "../detail-host"
import { itemToComposerData } from "../composer-mapping"
import type { WidgetData } from "@real-life-stack/toolkit"
import { useState } from "react"

/**
 * Address-book fields the composer offers, in rendering order. The ids match
 * `data.<field>` in contact/v1 — the composer stores each widget's value under
 * its id. Multi-value widgets (email, phone) use `createMultiInputWidget`.
 */
const CONTACT_WIDGET_DEFS: CustomWidgetDefinition[] = [
  createInputWidget({
    id: "givenName",
    label: "Vorname",
    icon: User,
    autoComplete: "given-name",
  }),
  createInputWidget({
    id: "familyName",
    label: "Nachname",
    icon: User,
    autoComplete: "family-name",
  }),
  createInputWidget({
    id: "organization",
    label: "Firma",
    icon: Building2,
    autoComplete: "organization",
  }),
  createInputWidget({
    id: "jobTitle",
    label: "Berufsbezeichnung",
    icon: Briefcase,
    autoComplete: "organization-title",
  }),
  createMultiInputWidget({
    id: "email",
    label: "E-Mail",
    icon: AtSign,
    inputType: "email",
    inputMode: "email",
    autoComplete: "email",
    addLabel: "E-Mail hinzufuegen",
  }),
  createMultiInputWidget({
    id: "phone",
    label: "Telefon",
    icon: Phone,
    inputType: "tel",
    inputMode: "tel",
    autoComplete: "tel",
    addLabel: "Telefon hinzufuegen",
  }),
  createInputWidget({
    id: "website",
    label: "Webseite",
    icon: Globe,
    inputType: "url",
    inputMode: "url",
    autoComplete: "url",
  }),
  createInputWidget({
    id: "streetAddress",
    label: "Strasse und Hausnummer",
    icon: Home,
    autoComplete: "street-address",
  }),
  createInputWidget({
    id: "postalCode",
    label: "PLZ",
    icon: MapPin,
    autoComplete: "postal-code",
  }),
  createInputWidget({
    id: "city",
    label: "Ort",
    icon: MapPin,
    autoComplete: "address-level2",
  }),
  createInputWidget({
    id: "country",
    label: "Land",
    icon: MapPin,
    autoComplete: "country-name",
  }),
]

const CONTACT_CONTENT_TYPE: ContentTypeConfig = {
  id: "person",
  label: "Kontakt",
  defaultWidgets: [
    "media",
    "givenName",
    "familyName",
    "organization",
    "jobTitle",
    "email",
    "phone",
    "website",
    "streetAddress",
    "postalCode",
    "city",
    "country",
  ],
  widgetLabels: {
    media: "Bild",
  },
  submitLabel: "Speichern",
  editLabel: "Speichern",
  icon: User,
  // groupRequired stays false — the composer does not expose the group widget
  // (contact fields are the point). The default group comes from the URL
  // scope: the active space when one is open, personal space in the overview.
}

/**
 * Pre-fill wrapper for the edit composer: the shared itemToComposerData maps
 * the RLS-core fields (title, text, date, location, media, tags, people) but
 * knows nothing about contact/v1's custom-widget ids. Without this wrapper an
 * edit opens with empty name / email / phone / address inputs.
 */
function itemToContactComposerData(item: Item): Partial<WidgetData> {
  const base = itemToComposerData(item)
  const d = item.data as Record<string, unknown>
  const stringField = (key: string): Partial<WidgetData> =>
    typeof d[key] === "string" && (d[key] as string).length > 0 ? { [key]: d[key] } : {}
  const arrayField = (key: string): Partial<WidgetData> =>
    Array.isArray(d[key]) && (d[key] as unknown[]).length > 0 ? { [key]: d[key] } : {}
  return {
    ...base,
    ...stringField("givenName"),
    ...stringField("familyName"),
    ...stringField("organization"),
    ...stringField("jobTitle"),
    ...arrayField("email"),
    ...arrayField("phone"),
    ...stringField("website"),
    ...stringField("streetAddress"),
    ...stringField("postalCode"),
    ...stringField("city"),
    ...stringField("country"),
  }
}

/** Sort keys the list exposes to the user. Aligns with the spec sort order:
 *  family name first, then given name, then organization; plus postal code,
 *  city and phone for common address-book workflows. */
type ContactSortKey =
  | "familyName"
  | "givenName"
  | "organization"
  | "postalCode"
  | "city"
  | "phone"

const SORT_LABELS: Record<ContactSortKey, string> = {
  familyName: "Nachname",
  givenName: "Vorname",
  organization: "Firma",
  postalCode: "PLZ",
  city: "Ort",
  phone: "Telefon",
}

/** Read the primary value for a sort key. Arrays return the first entry;
 *  missing values sort to the end via the empty-string sentinel. */
function contactSortValue(item: Item, key: ContactSortKey): string {
  const raw = (item.data as Record<string, unknown>)[key]
  if (typeof raw === "string") return raw
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") return raw[0]
  return ""
}

/**
 * Build a displayName from familyName + givenName so person/v1's required
 * `displayName` is always present. If either name part is missing, fall back
 * to whatever is available. This wraps the app's default mapper so mutations
 * still flow through mapComposerSubmission.
 */
function wrapMapperWithDisplayName(base: ItemEditorMapper): ItemEditorMapper {
  return (submission, opts) => {
    if (submission.contentType !== "person") return base(submission, opts)
    const data = submission.data as Record<string, unknown>
    const given = typeof data.givenName === "string" ? data.givenName.trim() : ""
    const family = typeof data.familyName === "string" ? data.familyName.trim() : ""
    let displayName = ""
    if (family && given) displayName = `${family}, ${given}`
    else if (family) displayName = family
    else if (given) displayName = given
    else if (typeof data.organization === "string") displayName = data.organization.trim()
    const nextData = displayName
      ? { ...submission.data, displayName }
      : submission.data
    return base({ ...submission, data: nextData }, opts)
  }
}

/**
 * Address Book Module — the reference app's wiring for the address-book space
 * module (spec: docs/spec/modules/address-book.md).
 *
 * V1 shows every item in the current space whose data carries
 * contact/v1's activation field (`familyName`), lets the user create and edit
 * them via a Content Composer that has the address-book field set enabled,
 * and reuses the shared list/detail infrastructure.
 */
export function AddressBookView({
  groupId,
  selectionFocusVisibleArea,
}: {
  groupId: string
  selectionFocusVisibleArea?: SelectionFocusVisibleArea
}) {
  const { data: allItems } = useItems()
  const { data: members } = useMembers(groupId === "__overview__" ? null : groupId)
  const { data: currentUser } = useCurrentUser()
  const { data: groups } = useGroups()
  const personalGroupId = usePersonalGroupId()
  const { itemId: focusedId, focusItem } = useItemFocus()
  const modulePanel = useModulePanel()
  const resolveGroupColor = useItemGroupColorResolver(groupId === "__overview__" ? undefined : groupId)
  const baseEditConfig = useItemDetailEdit(members)

  // Only items that have opted into contact/v1 (i.e. carry data.familyName).
  const contactItems = useMemo<Item[]>(
    () => (allItems ?? []).filter(hasContactData),
    [allItems],
  )

  // Sort key persisted per session via component state. Empty values sort to
  // the bottom regardless of key, so contacts missing e.g. a phone number
  // don't clog the head of a phone-sorted list.
  const [sortKey, setSortKey] = useState<ContactSortKey>("familyName")
  const items = useMemo<Item[]>(() => {
    const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" })
    return [...contactItems].sort((a, b) => {
      const va = contactSortValue(a, sortKey)
      const vb = contactSortValue(b, sortKey)
      if (va === "" && vb === "") return 0
      if (va === "") return 1
      if (vb === "") return -1
      return collator.compare(va, vb)
    })
  }, [contactItems, sortKey])

  // Suggestions: every tag that already appears on a contact in this space.
  // Deterministic, alphabetical for a stable list; the composer's autocomplete
  // filters by the current input.
  const tagSuggestions = useMemo<string[]>(() => {
    const seen = new Set<string>()
    for (const item of items) for (const t of item.tags ?? []) if (typeof t === "string") seen.add(t)
    return [...seen].sort((a, b) => a.localeCompare(b, "de"))
  }, [items])

  const mapperWithDisplayName = useMemo(
    () => wrapMapperWithDisplayName(baseEditConfig.mapper),
    [baseEditConfig.mapper],
  )

  // The edit-flow of the detail panel resolves the composer's widgets by the
  // item's type. useItemDetailEdit ships ALL_CONTENT_TYPES (post, event, place,
  // statement, task) — "person" is not there, so replacing contentTypes with
  // the address-book's own CONTACT_CONTENT_TYPE array is required for edit to
  // render the address-book widgets on an existing person item.
  const contactContentTypes = useMemo<ContentTypeConfig[]>(() => {
    const activeGroupId =
      groupId === "__overview__" ? personalGroupId ?? undefined : groupId
    return [
      {
        ...CONTACT_CONTENT_TYPE,
        groupOptions: (groups ?? []).map((g) => ({ id: g.id, name: g.name })),
        defaultGroup: activeGroupId,
      },
    ]
  }, [groups, groupId, personalGroupId])

  const detailConfig = useMemo<DetailConfig>(
    () => ({
      ...baseEditConfig,
      contentTypes: contactContentTypes,
      mapper: mapperWithDisplayName,
      // Overrides useItemDetailEdit's default (itemToComposerData) with the
      // contact-aware wrapper so opening a contact for edit pre-fills every
      // field the address book stores.
      editInitialData: itemToContactComposerData,
      composerProps: {
        ...baseEditConfig.composerProps,
        widgets: CONTACT_WIDGET_DEFS,
        tagSuggestions,
      },
      onShare: () => void navigator.clipboard?.writeText(window.location.href),
    }),
    [baseEditConfig, contactContentTypes, mapperWithDisplayName, tagSuggestions, currentUser, members, resolveGroupColor],
  )
  useRegisterDetail("address-book", detailConfig)

  const { startCreate } = useCreate()

  const createConfig = useMemo<CreateConfig>(
    () => ({
      contentTypes: contactContentTypes,
      mapper: mapperWithDisplayName,
      composerProps: {
        ...baseEditConfig.composerProps,
        widgets: CONTACT_WIDGET_DEFS,
        tagSuggestions,
      },
      shell: "sheet",
    }),
    [contactContentTypes, baseEditConfig.composerProps, mapperWithDisplayName, tagSuggestions],
  )
  useRegisterCreate("address-book", createConfig)

  const handleCreateItem = useCallback(() => startCreate(), [startCreate])

  return (
    <>
      <div className="mb-3 flex items-center gap-2 px-1">
        <label htmlFor="address-book-sort" className="text-xs text-muted-foreground">
          Sortieren nach
        </label>
        <select
          id="address-book-sort"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as ContactSortKey)}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          {(Object.keys(SORT_LABELS) as ContactSortKey[]).map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </div>
      <ToolkitCollectionView
        className="h-full"
        items={items}
        activeItemId={modulePanel.current?.itemId ?? focusedId}
        selectionFocusVisibleArea={selectionFocusVisibleArea}
        onItemClick={(item) => focusItem(item.id)}
      />
      <CreateFab onClick={handleCreateItem} label="Kontakt anlegen" />
    </>
  )
}
