import { test, expect } from "@playwright/test";

test("published September stats work without an API", async ({ page, isMobile }) => {
  test.skip(process.env.VITE_STATIC_DATA !== "true", "Requires published data mode");
  const apiRequests:string[]=[];
  page.on("request",r=>{if(new URL(r.url()).pathname.startsWith("/api/")) apiRequests.push(r.url());});
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Offensive leaders"})).toBeVisible();
  await expect(page.getByText("DEMO DATA",{exact:false})).toHaveCount(0);
  await expect(page.getByLabel("Players filter").locator("option")).toHaveText(["All players","Avneet","Baljeet","Chris","Mandeep","Saad","Sulav","Wilson"]);
  await page.getByLabel("Players filter").selectOption("saad");
  if (isMobile) {
    await expect(page.locator(".mobile-player").filter({hasText:"Saad"})).toContainText("21");
  } else {
    await expect(page.getByRole("row").filter({has:page.getByRole("button",{name:/Saad/})})).toContainText("21");
  }
  await page.getByRole("button",{name:/Sep 11, 2026 Game 1 21 – 27/}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Close dialog").click();
  await page.getByRole("button",{name:/Sep 11, 2026 Game 2 30 – 8/}).click();
  await expect(page.getByRole("dialog")).toContainText("Avneet");
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
