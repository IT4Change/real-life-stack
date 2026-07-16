import type { CreateItemInput, Item } from "@real-life-stack/data-interface"
import { isWritable } from "@real-life-stack/data-interface"
import { useConnector } from "./connector-context"

function useWritableConnector() {
  const connector = useConnector()
  if (!isWritable(connector)) {
    throw new Error("Connector does not support writing items")
  }
  return connector
}

export function useCreateItem() {
  const connector = useWritableConnector()
  return {
    mutate: (item: CreateItemInput) => connector.createItem(item),
  }
}

export function useUpdateItem() {
  const connector = useWritableConnector()
  return {
    mutate: (id: string, updates: Partial<Item>) => connector.updateItem(id, updates),
  }
}

export function useDeleteItem() {
  const connector = useWritableConnector()
  return {
    mutate: (id: string) => connector.deleteItem(id),
  }
}
