import { test, expect } from "@playwright/test";

test("published September stats work without an API", async ({ page, isMobile }) => {
  test.skip(process.env.VITE_STATIC_DATA !== "true", "Requires published data mode");
  const apiRequests:string[]=[];
  page.on("request",r=>{if(new URL(r.url()).pathname.startsWith("/api/")) apiRequests.push(r.url());});
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Offensive leaders"})).toBeVisible();
  await expect(page.getByText("DEMO DATA",{exact:false})).toHaveCount(0);
  await expect(page.getByLabel("Players filter").locator("option")).toHaveText(["All players","Avneet","Baljeet","Chris","Mandeep","Raman","Saad","Sulav","Wilson"]);
  await page.getByLabel("Players filter").selectOption("saad");
  if (isMobile) {
    await expect(page.locator(".mobile-player").filter({hasText:"Saad"})).toContainText("9.7");
  } else {
    await expect(page.getByRole("row").filter({has:page.getByRole("button",{name:/Saad/})})).toContainText("9.7");
  }
  await page.getByRole("button",{name:/Sep 11, 2026 Game 1 21 – 27/}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Close dialog").click();
  await page.getByRole("button",{name:/Sep 11, 2026 Game 2 30 – 8/}).click();
  await expect(page.getByRole("dialog")).toContainText("Avneet");
  await page.getByLabel("Close dialog").click();
  await page.getByRole("button",{name:/Sep 11, 2026 Game 3 30 – 29/}).click();
  await expect(page.getByRole("dialog")).toContainText("Raman");
  await expect(page.getByRole("dialog")).toContainText("160 recorded plays");
  await page.getByLabel("Close dialog").click();
  const nav=page.getByRole("navigation",{name:isMobile?"Mobile navigation":"Main navigation"});
  await nav.getByRole("button",{name:"Defense",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Defensive leaders"})).toBeVisible();
  await nav.getByRole("button",{name:"Ask AI",exact:true}).click();
  await expect(page.getByText("AI chat is not enabled on this site.",{exact:false})).toBeVisible();
  await page.getByRole("button",{name:"Manage data",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Updating the stats"})).toBeVisible();
  expect(apiRequests).toEqual([]);
});


test("individual game tabs show full box scores", async ({ page }) => {
  test.skip(process.env.VITE_STATIC_DATA !== "true", "Requires published data mode");
  await page.goto("/");
  const tabs = page.getByRole("group", { name: "Game statistics" });
  await expect(page.getByLabel("Stat display mode")).toHaveValue("per-game");
  for (const [game, points, assists, steals] of [[1,15,0,1], [2,6,0,3], [3,8,3,0]]) {
    await tabs.getByRole("button", { name: new RegExp(`^Game ${game}`) }).click();
    const row = page.locator(".leaderboard table tbody tr").filter({ hasText: "Saad" });
    await expect(row.locator("td").nth(3)).toHaveText(String(points));
    await expect(row.locator("td").nth(11)).toHaveText(String(assists));
    await expect(row.locator("td").nth(21)).toHaveText(String(steals));
    await expect(page.locator(".leaderboard table")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await tabs.getByRole("button", { name: /^Game 2/ }).click();
  await expect(page.locator(".leaderboard table tbody tr").filter({ hasText: "Chris" }).locator("td").nth(3)).toHaveText("0");
  await tabs.getByRole("button", { name: "Per game averages" }).click();
  await expect(tabs.getByRole("button", { name: "Per game averages" })).toHaveAttribute("aria-pressed", "true");
});
