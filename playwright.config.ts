import {defineConfig} from "@playwright/test";
import {tmpdir} from "node:os";
import {join} from "node:path";
export default defineConfig({
  testDir: "tests", workers: 1, timeout: 120000,
  outputDir: join(tmpdir(), "dcp-playwright-results"),
  use: {baseURL: process.env.DCP_TEST_URL || "http://127.0.0.1:5176", actionTimeout: 15000, headless: true, channel: "chrome", viewport: {width: 1440, height: 1000}},
});
