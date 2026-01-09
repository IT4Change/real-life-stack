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
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring">
        <Avatar className="h-6 w-6">
          <AvatarImage src={activeWorkspace.avatar} alt={activeWorkspace.name} />
          <AvatarFallback className="text-xs">
            {getInitials(activeWorkspace.name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden sm:inline-block">{activeWorkspace.name}</span>
        <ChevronsUpDown className="h-4 w-4 opacity-50" />
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
            <Avatar className="h-5 w-5">
              <AvatarImage src={workspace.avatar} alt={workspace.name} />
              <AvatarFallback className="text-xs">
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
