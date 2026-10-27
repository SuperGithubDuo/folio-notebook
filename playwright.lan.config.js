import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "lan.spec.js",
  workers: 1,
  reporter: "list",
  use: { headless: true },
  projects: [
    {
      name: "lan-chromium",
      use: { browserName: "chromium", viewport: { width: 1280, height: 900 } },
    },
    {
      name: "lan-mobile-chromium",
      use: { ...devices["Pixel 7"], browserName: "chromium" },
    },
    {
      name: "lan-webkit",
      use: { browserName: "webkit", viewport: { width: 1280, height: 900 } },
    },
    {
      name: "lan-ipad-webkit",
      use: { ...devices["iPad Pro 11"], browserName: "webkit" },
    },
  ],
});
