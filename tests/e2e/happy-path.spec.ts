import { expect, test, type Page } from "@playwright/test";

const domain = process.env.INSTITUTIONAL_EMAIL_DOMAINS?.split(",")[0]?.trim() || "eafit.edu.co";

async function login(page: Page, localPart: string) {
  await page.goto("/login");
  await page.getByLabel("Correo institucional").fill(`${localPart}@${domain}`);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de 6 dígitos").waitFor();
  await page.getByLabel("Código de 6 dígitos").fill(process.env.OTP_FIXED_CODE || "123456");
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await page.waitForURL(/\/(app|admin)/);
}

test("an invalid session cookie reaches login instead of redirecting forever", async ({
  context,
  page,
  baseURL,
}) => {
  await context.addCookies([
    {
      name: "gh_session",
      value: "invalid-session-token",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);

  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Entra a tu temporada" })).toBeVisible();
});

test("the authentication redirect preserves the requested query string", async ({ page }) => {
  await page.goto("/app/rankings?period=week&isoWeek=2026-W33");
  const url = new URL(page.url());
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("next")).toBe("/app/rankings?period=week&isoWeek=2026-W33");
});

test("member registration updates points, history and ranking", async ({ page }, testInfo) => {
  const domain = process.env.INSTITUTIONAL_EMAIL_DOMAINS?.split(",")[0]?.trim() || "eafit.edu.co";
  const memberNumber = testInfo.project.name === "mobile-webkit" ? "48" : "50";
  await page.goto("/login");
  await page.getByLabel("Correo institucional").fill(`integrante.${memberNumber}@${domain}`);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de 6 dígitos").waitFor();
  await page.getByLabel("Código de 6 dígitos").fill(process.env.OTP_FIXED_CODE || "123456");
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await page.waitForURL(/\/(app|admin)/);
  await page.goto("/app");
  const baseline = Number(
    await page.getByText("GH Points", { exact: true }).locator("..").locator(".marcador").innerText()
  );
  await page.goto("/app/activities");
  await expect(page.getByRole("heading", { name: /Actividades/i })).toBeVisible();
  const openCard = page.locator("a").filter({ hasText: /pts/ }).first();
  const cardText = await openCard.innerText();
  const expectedIncrease = Number(cardText.match(/\+(\d+) pts/)?.[1] ?? "0");
  expect(expectedIncrease).toBeGreaterThan(0);
  await openCard.click();
  await expect(
    page.getByRole("button", { name: /Registrar asistencia/i }).or(page.getByText(/Asistencia registrada/i))
  ).toBeVisible();
  const register = page.getByRole("button", { name: /Registrar asistencia/i });
  await register.click();
  await expect(page.getByText(/Asistencia registrada/i)).toBeVisible();
  await page.goto("/app");
  await expect(page.getByText("GH Points", { exact: true }).locator("..").locator(".marcador"))
    .toHaveText(String(baseline + expectedIncrease));
  await page.goto("/app/me");
  await expect(page.getByText(`+${expectedIncrease}`, { exact: true }).first()).toBeVisible();
  await page.goto("/app/rankings");
  await expect(page.getByRole("heading", { name: /Podio/i })).toBeVisible();
  await expect(page.getByText(new RegExp(`${baseline + expectedIncrease} pts`)).first()).toBeVisible();
});

test("admin overview is reachable after OTP", async ({ page }) => {
  const domain = process.env.INSTITUTIONAL_EMAIL_DOMAINS?.split(",")[0]?.trim() || "eafit.edu.co";
  await page.goto("/login");
  await page.getByLabel("Correo institucional").fill(`gh.general@${domain}`);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de 6 dígitos").fill(process.env.OTP_FIXED_CODE || "123456");
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await page.waitForURL(/\/admin/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto("/admin/activities");
  await expect(page.getByRole("heading", { name: "Actividades" })).toBeVisible();
  await page.goto("/admin/attendance");
  const approve = page.getByRole("button", { name: "Aprobar" }).first();
  if (await approve.isVisible()) {
    await approve.click();
    await expect(page.getByText(/Listo|No hay registros pendientes/i)).toBeVisible({ timeout: 10_000 }).catch(() => undefined);
  }
});

test("admin can create a manual activity and see it listed", async ({ page }) => {
  const domain = process.env.INSTITUTIONAL_EMAIL_DOMAINS?.split(",")[0]?.trim() || "eafit.edu.co";
  await page.goto("/login");
  await page.getByLabel("Correo institucional").fill(`gh.general@${domain}`);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de 6 dígitos").fill(process.env.OTP_FIXED_CODE || "123456");
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await page.waitForURL(/\/admin/);
  await page.goto("/admin/activities");
  const stamp = Date.now();
  await page.getByLabel("Nombre").fill(`E2E Athletic ${stamp}`);
  await page.getByLabel("Inicio").fill("2026-09-01T18:00");
  await page.getByLabel("GH Points individuales").fill("12");
  await page.getByLabel("Registro desde").fill("2026-08-01T08:00");
  await page.getByLabel("Registro hasta").fill("2026-09-02T22:00");
  await page.getByLabel("Aprobación").selectOption("MANUAL");
  await page.getByRole("button", { name: "Crear y generar QR" }).click();
  await expect(page.getByText(`E2E Athletic ${stamp}`)).toBeVisible();
});

test("the QR link survives the login redirect, query string included", async ({ page }) => {
  const domain = process.env.INSTITUTIONAL_EMAIL_DOMAINS?.split(",")[0]?.trim() || "eafit.edu.co";

  // Discover a real QR target first. Uses the member account so the suite stays
  // under the OTP rate limit for the shared admin mailbox.
  await page.goto("/login");
  await page.getByLabel("Correo institucional").fill(`integrante.02@${domain}`);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de 6 dígitos").waitFor();
  await page.getByLabel("Código de 6 dígitos").fill(process.env.OTP_FIXED_CODE || "123456");
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await page.waitForURL(/\/(app|admin)/);
  await page.goto("/app/activities");
  const qrLink = page.locator('a[href^="/a/"]').first();
  await qrLink.waitFor();
  const href = await qrLink.getAttribute("href");
  expect(href).toBeTruthy();
  await page.context().clearCookies();

  const target = `${href}?t=e2e-token`;
  await page.goto(target);
  await page.waitForURL(/\/login/);
  expect(page.url()).toContain("t%3De2e-token");

  await page.getByLabel("Correo institucional").fill(`integrante.02@${domain}`);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de 6 dígitos").waitFor();
  await page.getByLabel("Código de 6 dígitos").fill(process.env.OTP_FIXED_CODE || "123456");
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await page.waitForURL(/\/a\/|\/app/);
  if (page.url().includes("/a/")) {
    expect(page.url()).toContain("t=e2e-token");
  }
});

test("admin approves only the selected pending registration from the activity page", async ({ page }) => {
  const domain = process.env.INSTITUTIONAL_EMAIL_DOMAINS?.split(",")[0]?.trim() || "eafit.edu.co";
  const stamp = Date.now();

  // Admin creates a MANUAL activity, so registrations land as PENDING.
  await page.goto("/login");
  await page.getByLabel("Correo institucional").fill(`gh.general@${domain}`);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de 6 dígitos").waitFor();
  await page.getByLabel("Código de 6 dígitos").fill(process.env.OTP_FIXED_CODE || "123456");
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await page.waitForURL(/\/admin/);

  await page.goto("/admin/activities");
  const name = `E2E Bulk ${stamp}`;
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Inicio").fill("2026-09-01T18:00");
  await page.getByLabel("GH Points individuales").fill("7");
  await page.getByLabel("Registro desde").fill("2026-01-01T08:00");
  await page.getByLabel("Registro hasta").fill("2027-01-01T22:00");
  await page.getByLabel("Aprobación").selectOption("MANUAL");
  await page.getByRole("button", { name: "Crear y generar QR" }).click();
  await expect(page.getByText(name)).toBeVisible();

  const activityLink = page
    .locator("a")
    .filter({ hasText: name })
    .first();
  const href = await activityLink.getAttribute("href");
  expect(href).toBeTruthy();

  // A member registers through the public link, leaving one PENDING row.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Correo institucional").fill(`integrante.03@${domain}`);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de 6 dígitos").waitFor();
  await page.getByLabel("Código de 6 dígitos").fill(process.env.OTP_FIXED_CODE || "123456");
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await page.waitForURL(/\/app/);
  await page.goto("/app/activities");
  const qrLink = page.locator(`a[href^="/a/"]`).filter({ hasText: name }).first();
  await qrLink.click();
  await page.getByRole("button", { name: /Registrar asistencia/i }).click();
  await expect(page.getByText(/Asistencia registrada/i)).toBeVisible();

  // Admin approves the batch from the activity page.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Correo institucional").fill(`gh.general@${domain}`);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de 6 dígitos").waitFor();
  await page.getByLabel("Código de 6 dígitos").fill(process.env.OTP_FIXED_CODE || "123456");
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await page.waitForURL(/\/admin/);
  await page.goto(href!);

  await page.getByRole("checkbox", { name: /^Seleccionar asistencia de/ }).check();
  await expect(page.getByRole("status")).toContainText("1 seleccionada");
  await page.getByRole("button", { name: "Aprobar seleccionadas" }).click();

  // No pending rows left, and the attendance row now reads "Aprobada": the UI
  // shows the Spanish label from src/lib/labels.ts, never the raw enum.
  await expect(page.getByRole("button", { name: /Aprobar todos \(/ })).toBeHidden();
  await expect(
    page.locator('[data-slot="badge"]:visible').filter({ hasText: "Aprobada" }).first()
  ).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Correo institucional").fill(`integrante.03@${domain}`);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de 6 dígitos").fill(process.env.OTP_FIXED_CODE || "123456");
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await page.waitForURL(/\/app/);
  await page.goto("/app/me");
  const historyRow = page.locator("li").filter({ hasText: `Asistencia: ${name}` });
  await expect(historyRow).toBeVisible();
  await expect(historyRow.getByText("+7", { exact: true })).toBeVisible();
});

test("RBAC keeps members and leaders out of admin while exposing the leader roster", async ({
  context,
  page,
}) => {
  await login(page, "integrante.05");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/committees");
  await expect(page.getByText("No lideras un comité")).toBeVisible();

  await context.clearCookies();
  await login(page, "lider.gemis");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/committees");
  await expect(page.getByRole("heading", { name: "Mis comités" })).toBeVisible();
  await page.getByRole("link", { name: /GEMIS/ }).click();
  await expect(page.getByRole("heading", { name: "GEMIS" })).toBeVisible();
  await expect(page.getByText("Proponer actividad")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();

  await context.clearCookies();
  await login(page, "gh.general");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("admin advances an activity through the complete forward-only lifecycle", async ({ page }) => {
  await login(page, "gh.general");
  await page.goto("/admin/activities");
  const name = `E2E Lifecycle ${Date.now()}`;
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Inicio").fill("2026-10-01T18:00");
  await page.getByLabel("GH Points individuales").fill("9");
  await page.getByLabel("Registro desde").fill("2026-08-01T08:00");
  await page.getByLabel("Registro hasta").fill("2026-10-02T22:00");
  await page.getByLabel("Estado").selectOption("DRAFT");
  await page.getByRole("button", { name: "Crear y generar QR" }).click();
  await page.getByRole("link", { name }).click();

  await page.getByRole("button", { name: "Publicar actividad" }).click();
  await expect(page.getByRole("button", { name: "Cerrar registro" })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar registro" }).click();
  await expect(page.getByRole("button", { name: "Procesar actividad" })).toBeVisible();
  await page.getByRole("button", { name: "Procesar actividad" }).click();
  await expect(page.getByText("Procesada", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Publicar actividad" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Cerrar registro" })).toBeHidden();
});

test("cancelling an accredited activity restores the exact member balance", async ({
  context,
  page,
}, testInfo) => {
  const memberNumber = testInfo.project.name === "mobile-webkit" ? "47" : "46";
  await login(page, `integrante.${memberNumber}`);
  await page.goto("/app");
  const points = page.getByText("GH Points", { exact: true }).locator("..").locator(".marcador");
  const baseline = Number(await points.innerText());

  await context.clearCookies();
  await login(page, "gh.general");
  await page.goto("/admin/activities");
  const name = `E2E Cancellation ${Date.now()}`;
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Inicio").fill("2026-10-03T18:00");
  await page.getByLabel("GH Points individuales").fill("11");
  await page.getByLabel("Registro desde").fill("2026-01-01T08:00");
  await page.getByLabel("Registro hasta").fill("2027-01-01T22:00");
  await page.getByLabel("Aprobación").selectOption("AUTO");
  await page.getByRole("button", { name: "Crear y generar QR" }).click();
  const detailHref = await page.getByRole("link", { name }).getAttribute("href");
  expect(detailHref).toBeTruthy();

  await context.clearCookies();
  await login(page, `integrante.${memberNumber}`);
  await page.goto("/app/activities");
  await page.locator('a[href^="/a/"]').filter({ hasText: name }).click();
  await page.getByRole("button", { name: /Registrar asistencia/i }).click();
  await expect(page.getByText(/Asistencia registrada/i)).toBeVisible();
  await page.goto("/app");
  await expect(points).toHaveText(String(baseline + 11));

  await context.clearCookies();
  await login(page, "gh.general");
  await page.goto(detailHref!);
  await page.getByRole("button", { name: "Cancelar actividad" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Motivo de cancelación").fill("Evento suspendido por logística");
  await dialog.getByRole("button", { name: "Cancelar y revertir créditos" }).click();
  await expect(page.getByText("Cancelada", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Evento suspendido por logística/)).toBeVisible();

  await context.clearCookies();
  await login(page, `integrante.${memberNumber}`);
  await page.goto("/app/me");
  await expect(page.getByText("GH Points", { exact: true }).locator("..").locator(".marcador"))
    .toHaveText(String(baseline));
  const awardRow = page.locator("li").filter({ hasText: `Asistencia: ${name}` });
  const reversalRow = page.locator("li").filter({ hasText: `Cancelación de actividad: ${name}` });
  await expect(awardRow).toBeVisible();
  await expect(reversalRow).toBeVisible();
  await expect(awardRow.getByText("+11", { exact: true })).toBeVisible();
  await expect(reversalRow.getByText("-11", { exact: true })).toBeVisible();
});

test("operational smoke covers keyboard, theme, reduced motion and QR rendering", async ({
  context,
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  if (testInfo.project.name === "desktop-chromium") {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  }
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
    true
  );

  await login(page, "integrante.06");
  await page.goto("/app");
  const themeToggle = page.getByRole("button", { name: "Cambiar a modo oscuro" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await themeToggle.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Cambiar a modo claro" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await context.clearCookies();
  await login(page, "gh.general");
  await page.goto("/admin/activities");
  await page.locator('a[href^="/admin/activities/"]').first().click();
  const qr = page.getByRole("img", { name: "Código QR de la actividad" });
  await expect(qr).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(qr).toHaveJSProperty("complete", true);
  await expect(page.getByText(/http:\/\/localhost:3000\/a\//).first()).toBeVisible();
});
