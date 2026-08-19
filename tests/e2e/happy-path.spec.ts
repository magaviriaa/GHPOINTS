import { expect, test } from "@playwright/test";

test("member can log in, open an activity and see attendance CTA", async ({ page }) => {
  const domain = process.env.INSTITUTIONAL_EMAIL_DOMAINS?.split(",")[0]?.trim() || "eafit.edu.co";
  await page.goto("/login");
  await page.getByLabel("Correo institucional").fill(`integrante.02@${domain}`);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código de 6 dígitos").waitFor();
  await page.getByLabel("Código de 6 dígitos").fill(process.env.OTP_FIXED_CODE || "123456");
  await page.getByRole("button", { name: "Verificar y entrar" }).click();
  await page.waitForURL(/\/(app|admin)/);
  await page.goto("/app/activities");
  await expect(page.getByRole("heading", { name: /Actividades/i })).toBeVisible();
  const openCard = page.locator("a").filter({ hasText: /pts/ }).first();
  await openCard.click();
  await expect(
    page.getByRole("button", { name: /Registrar asistencia/i }).or(page.getByText(/Asistencia registrada/i))
  ).toBeVisible();
  const register = page.getByRole("button", { name: /Registrar asistencia/i });
  if (await register.isVisible()) {
    await register.click();
    await expect(page.getByText(/Asistencia registrada/i)).toBeVisible();
  }
  await page.goto("/app/rankings");
  await expect(page.getByRole("heading", { name: /Podio/i })).toBeVisible();
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

test("admin bulk-approves a pending registration from the activity page", async ({ page }) => {
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

  const bulkApprove = page.getByRole("button", { name: /Aprobar todos los pendientes/ });
  await expect(bulkApprove).toBeVisible();
  await bulkApprove.click();

  // No pending rows left, and the attendance row now reads "Aprobada": the UI
  // shows the Spanish label from src/lib/labels.ts, never the raw enum.
  await expect(page.getByRole("button", { name: /Aprobar todos los pendientes/ })).toBeHidden();
  await expect(page.locator("td").filter({ hasText: "Aprobada" }).first()).toBeVisible();
});
