import { config } from "dotenv";

config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const CONFIG = {
  PORT: parseInt(process.env.PORT || "4000", 10),

  // Supabase
  SUPABASE_URL: requireEnv("SUPABASE_URL"),
  SUPABASE_SERVICE_KEY: requireEnv("SUPABASE_SERVICE_KEY"),

  // Google Gemini
  GEMINI_API_KEY: requireEnv("GEMINI_API_KEY"),

  // WAHA
  WAHA_API_URL: process.env.WAHA_API_URL || "http://waha:3000",
  WAHA_SESSION: process.env.WAHA_SESSION || "default",
} as const;
