import { test, expect } from "@playwright/test";
test("voice request on an insecure origin explains HTTPS instead of crashing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", {
      value: false,
      configurable: true,
    });
    window.SpeechRecognition = class {
      start() {
        throw new DOMException("Insecure context", "SecurityError");
      }
    };
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Voice question", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("HTTPS");
});
test("tutor request works without AbortSignal.timeout on older supported Safari", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(AbortSignal, "timeout", {
      value: undefined,
      configurable: true,
    }),
  );
  let requested = false;
  await page.route("**/api/tutor", async (route) => {
    requested = true;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Provider credentials are not configured.",
      }),
    });
  });
  await page.goto("/");
  await page.getByLabel("Question for tutor").fill("Check my notes");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".ai-error")).toContainText("credentials");
  expect(requested).toBe(true);
});
