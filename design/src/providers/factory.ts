/**
 * Provider factory.
 *
 * Resolves the concrete DesignProvider for the current process based on:
 *   1. GSTACK_DESIGN_PROVIDER env var ("gemini" | "openai") — explicit choice
 *   2. ~/.gstack/config.yaml design_provider ("auto" | "gemini" | "openai")
 *   3. Auto-detect: prefer Gemini if a Gemini key is available, fall back to OpenAI
 *
 * All design tool call sites should import getProvider from here instead of
 * constructing providers directly or reading API keys themselves.
 */

import type { DesignProvider, ProviderName } from "./provider";
import { GEMINI_KEY_URL, OPENAI_KEY_URL } from "./provider";
import { OpenAIProvider } from "./openai";
import { GeminiProvider } from "./gemini";
import { resolveGeminiKey, resolveOpenAIKey } from "../auth";
import fs from "fs";
import path from "path";

let cached: DesignProvider | null = null;

export function getProvider(): DesignProvider {
  if (cached) return cached;

  const raw = resolveProviderPreference();
  const forced: ProviderName | "" = raw === "openai" || raw === "gemini" ? raw : "";
  if (raw && raw !== "auto" && !forced) {
    console.warn(
      `design provider "${raw}" is not recognized (expected "auto", "openai", or "gemini"); falling back to auto-detect.`,
    );
  }

  if (forced === "openai") {
    const key = resolveOpenAIKey();
    if (!key) {
      throw new Error(
        "GSTACK_DESIGN_PROVIDER=openai but no OpenAI key found.\n"
        + "Set OPENAI_API_KEY or save to ~/.gstack/openai.json.\n"
        + `Get one at: ${OPENAI_KEY_URL}`,
      );
    }
    cached = new OpenAIProvider(key);
    return cached;
  }

  if (forced === "gemini") {
    const key = resolveGeminiKey();
    if (!key) {
      throw new Error(
        "GSTACK_DESIGN_PROVIDER=gemini but no Gemini key found.\n"
        + "Set GEMINI_API_KEY or save to ~/.gstack/gemini.json.\n"
        + `Get one at: ${GEMINI_KEY_URL}`,
      );
    }
    cached = new GeminiProvider(key);
    return cached;
  }

  // Auto: prefer Gemini (new default, better quality/price on typography
  // and UI accuracy per Nano Banana 2 benchmarks), fall back to OpenAI.
  const geminiKey = resolveGeminiKey();
  if (geminiKey) {
    cached = new GeminiProvider(geminiKey);
    return cached;
  }

  const openaiKey = resolveOpenAIKey();
  if (openaiKey) {
    cached = new OpenAIProvider(openaiKey);
    return cached;
  }

  throw new Error(
    "No design provider API key found.\n"
    + "\n"
    + `Gemini (recommended, default): ${GEMINI_KEY_URL}\n`
    + "  Save to ~/.gstack/gemini.json or set GEMINI_API_KEY\n"
    + "\n"
    + `OpenAI (legacy): ${OPENAI_KEY_URL}\n`
    + "  Save to ~/.gstack/openai.json or set OPENAI_API_KEY\n"
    + "\n"
    + "Run: $D setup",
  );
}

/** Clear the cached provider. Useful for tests and for setup flows. */
export function resetProvider(): void {
  cached = null;
}

function resolveProviderPreference(): string {
  const fromEnv = (process.env.GSTACK_DESIGN_PROVIDER || "").trim().toLowerCase();
  if (fromEnv) return fromEnv;

  const configPath = path.join(
    process.env.GSTACK_HOME || process.env.GSTACK_STATE_DIR || path.join(process.env.HOME || "~", ".gstack"),
    "config.yaml",
  );

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const match = content
      .split(/\r?\n/)
      .map(line => line.match(/^\s*design_provider:\s*([^\s#]+)/))
      .filter(Boolean)
      .pop();
    return (match?.[1] || "auto").trim().toLowerCase();
  } catch {
    return "auto";
  }
}
