import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const domain = process.env.INSTITUTIONAL_EMAIL_DOMAINS?.split(",")[0]?.trim() || "eafit.edu.co";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo institucional").fill(email);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de 6 dígitos").fill(process.env.OTP_FIXED_CODE || "123456");
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await page.waitForURL(/\/(app|admin)/);
}

async function expectAccessible(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main")).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical"
    )
  ).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("critical member and admin surfaces pass accessibility and responsive gates", async ({
  context,
  page,
}) => {
  await page.goto("/login");
  const loginResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    loginResults.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical"
    )
  ).toEqual([]);

  await login(page, `integrante.01@${domain}`);
  await expectAccessible(page, "/app");
  await expectAccessible(page, "/app/rankings");
  await expectAccessible(page, "/app/activities");
  const publicHref = await page.locator('a[href^="/a/"]').first().getAttribute("href");
  if (publicHref) await expectAccessible(page, publicHref);

  await context.clearCookies();
  await login(page, `gh.general@${domain}`);
  await expectAccessible(page, "/admin");
  await expectAccessible(page, "/admin/activities");
  await expectAccessible(page, "/admin/attendance");
});
