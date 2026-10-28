import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("config", () => {
  it("loads Gemini settings from the repository root dotenv file", () => {
    const config = loadConfig({});

    expect(config.geminiApiKey).toBeDefined();
    expect(config.geminiModel).toBeDefined();
    expect(config.geminiBaseUrl).toBeDefined();
  });

  it("treats placeholder Gemini credentials as unconfigured", () => {
    const config = loadConfig({ GEMINI_API_KEY: "replace-with-your-gemini-key", GEMINI_MODEL: "your-gemini-model" });

    expect(config.geminiApiKey).toBe("test-mock-key");
    expect(config.geminiModel).toBe("gemini-2.0-flash");
  });
});
