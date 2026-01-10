"use client"

import { ChevronsUpDown, Plus } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export interface Workspace {
  id: string
  name: string
  avatar?: string
}

interface WorkspaceSwitcherProps {
  workspaces: Workspace[]
  activeWorkspace: Workspace
  onWorkspaceChange: (workspace: Workspace) => void
  onCreateWorkspace?: () => void
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspace,
  onWorkspaceChange,
  onCreateWorkspace,
}: WorkspaceSwitcherProps) {
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
      <DropdownMenuTrigger className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent">
        <Avatar className="h-8 w-8 rounded-md">
          <AvatarImage src={activeWorkspace.avatar} alt={activeWorkspace.name} className="rounded-md" />
          <AvatarFallback className="text-sm font-semibold rounded-md">
            {getInitials(activeWorkspace.name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden sm:inline-block text-lg font-semibold">{activeWorkspace.name}</span>
        <ChevronsUpDown className="h-4 w-4 opacity-50 hidden sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => onWorkspaceChange(workspace)}
            className="flex items-center gap-2"
          >
            <Avatar className="h-5 w-5 rounded-none">
              <AvatarImage src={workspace.avatar} alt={workspace.name} className="rounded-none" />
              <AvatarFallback className="text-xs rounded-none">
                {getInitials(workspace.name)}
              </AvatarFallback>
            </Avatar>
            <span>{workspace.name}</span>
          </DropdownMenuItem>
        ))}
        {onCreateWorkspace && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCreateWorkspace} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <span>Neue Gruppe erstellen</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
