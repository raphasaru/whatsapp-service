import express from "express";
import { CONFIG } from "./config.js";
import { handleWahaWebhook } from "./webhooks/waha.js";

const app = express();

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// WAHA webhook endpoint
app.post("/webhook", handleWahaWebhook);

app.listen(CONFIG.PORT, () => {
  console.log(`WhatsApp service running on port ${CONFIG.PORT}`);
});
