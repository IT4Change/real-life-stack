import { expect, test } from "@playwright/test"

test.describe("Collection space module", () => {
  test("resolves a collection item route and keeps the focused item when switching from Feed", async ({ page }) => {
    await page.goto("/group-1/feed/post-1?connector=local")

    await expect(page).toHaveURL(/\/group-1\/feed\/post-1/)
    await expect(page.getByRole("button", { name: "Liste" })).toBeVisible()

    await page.getByRole("button", { name: "Liste" }).click()

    await expect(page).toHaveURL(/\/group-1\/collection\/post-1/)
    await expect(page.locator('[aria-label="Listenansicht"] article[data-active-preview="true"]')).toHaveCount(1)
    await expect(page.locator('[aria-label="Listenansicht"] article[data-active-preview="true"]')).toContainText("Feature-Komponenten umstrukturiert")
  })

  test("renders the canonical collection route with its focused item", async ({ page }) => {
    await page.goto("/group-1/collection/task-1?connector=local")

    await expect(page).toHaveURL(/\/group-1\/collection\/task-1/)
    await expect(page.locator('[aria-label="Listenansicht"] article[data-active-preview="true"]')).toContainText("KanbanBoard Drag & Drop")
  })
})
