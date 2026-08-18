"use client"

import { Check, Languages, LogOut, QrCode, Settings, User, Users } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/primitives/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/primitives/avatar"
import { t, setLanguage, SUPPORTED_LANGUAGES, type Language } from "@/i18n"
import { useLanguage } from "@/i18n/use-i18n"

/**
 * Eigennamen der Sprachen — bewusst NICHT übersetzt: wer in der falschen
 * Sprache festhängt, muss seine eigene im Menü erkennen können. „Deutsch"
 * bleibt „Deutsch", auch wenn die Oberfläche englisch ist.
 */
const LANGUAGE_NAMES: Record<Language, string> = {
  de: "Deutsch",
  en: "English",
}

export interface UserData {
  id: string
  name: string
  email?: string
  avatar?: string
}

interface UserMenuProps {
  user: UserData
  onProfile?: () => void
  onContacts?: () => void
  contactCount?: number
  onVerify?: () => void
  onSettings?: () => void
  onLogout?: () => void
}

export function UserMenu({
  user,
  onProfile,
  onContacts,
  contactCount,
  onVerify,
  onSettings,
  onLogout,
}: UserMenuProps) {
  const language = useLanguage()

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full" data-testid="user-menu-trigger">
        <Avatar className="h-8 w-8">
          <AvatarImage src={user.avatar} alt={user.name} />
          <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{user.name}</p>
            {user.email && (
              <p className="text-xs text-muted-foreground">{user.email}</p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {onProfile && (
          <DropdownMenuItem onClick={onProfile} className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>{t("userMenu.profile")}</span>
          </DropdownMenuItem>
        )}
        {onContacts && (
          <DropdownMenuItem onClick={onContacts} className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>{t("userMenu.contacts")}</span>
            {contactCount != null && contactCount > 0 && (
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{contactCount}</span>
            )}
          </DropdownMenuItem>
        )}
        {onVerify && (
          <DropdownMenuItem onClick={onVerify} className="flex items-center gap-2">
            <QrCode className="h-4 w-4" />
            <span>{t("userMenu.verify")}</span>
          </DropdownMenuItem>
        )}
        {onSettings && (
          <DropdownMenuItem onClick={onSettings} className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>{t("userMenu.settings")}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
          <Languages className="h-3.5 w-3.5" />
          {t("userMenu.language")}
        </DropdownMenuLabel>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang}
            onClick={() => setLanguage(lang)}
            className="flex items-center gap-2"
            data-testid={`language-${lang}`}
          >
            <span className="w-4" aria-hidden>
              {lang === language && <Check className="h-4 w-4" />}
            </span>
            <span>{LANGUAGE_NAMES[lang]}</span>
          </DropdownMenuItem>
        ))}
        {onLogout && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="flex items-center gap-2 text-destructive">
              <LogOut className="h-4 w-4" />
              <span>{t("userMenu.logout")}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
