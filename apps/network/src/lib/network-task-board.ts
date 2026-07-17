import { isWritable, type DataInterface, type Item } from "@real-life-stack/data-interface"
import { computeColumnReorder } from "@real-life-stack/toolkit"

/** The network board is a workflow lens over the seven seeded camp tasks. */
export function networkTaskBoardItems(items: readonly Item[]): Item[] {
  return items.filter(({ type }) => type === "task")
}

/**
 * The only P3 mutation: move a task by writing its status and the target
 * column's order through the connector's ItemWriter capability.
 */
export async function moveNetworkTask(
  connector: DataInterface,
  tasks: readonly Item[],
  itemId: string,
  newStatus: string,
  position: number,
): Promise<void> {
  if (!isWritable(connector)) return

  const task = tasks.find((item) => item.id === itemId && item.type === "task")
  if (!task) return

  const updates = computeColumnReorder([...tasks], task, newStatus, position)
  await Promise.all(updates.map(({ id, data }) => connector.updateItem(id, { data })))
}
