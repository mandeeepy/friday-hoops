import { test, expect } from "@playwright/test";
test("filters, player details, and all three tabs work", async ({
  page,
  isMobile,
}) => {
  await page.goto("/?demo=1");
  await expect(
    page.getByRole("heading", { name: "Make every play count." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Offensive leaders" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "All time", exact: true }).click();
  await expect(page.getByText("Aug 7, 2026 – Sep 4, 2026")).toBeVisible();
  await page.getByLabel("Players filter").selectOption("kai");
  await expect(page.getByLabel("Players filter")).toHaveValue("kai");
  await page.getByLabel("Stat display mode").selectOption("per-game");
  await page.getByLabel("Reset all filters").click();
  const nav = page.getByRole("navigation", {
    name: isMobile ? "Mobile navigation" : "Main navigation",
  });
  await nav.getByRole("button", { name: "Defense", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Defensive leaders" }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "Ask AI", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "There’s a story in your stats." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "V4 Pro", exact: true }).click();
  await page.getByLabel("Ask about your games").fill("Who scored most?");
  await page.getByLabel("Send question").click();
  await expect(page.getByRole("alert")).toContainText(
    "Sample mode never sends a paid request",
  );
});
test("manager validates sample and preserves owner boundary", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: "Manage data" }).click();
  await page
    .getByRole("button", { name: "Load sample file", exact: true })
    .click();
  await page.getByRole("button", { name: "Validate & preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Ready for your review" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish reviewed games" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Sample mode is a preview",
  );
});
test("mobile widths do not overflow", async ({ page }) => {
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/?demo=1");
    await expect(
      page.getByRole("heading", { name: "Offensive leaders" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("double text size remains usable without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo=1");
  await expect(
    page.getByRole("heading", { name: "Offensive leaders" }),
  ).toBeVisible();
  await page.addStyleTag({ content: ":root { font-size: 32px !important; }" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByLabel("Players filter")).toBeVisible();
});
