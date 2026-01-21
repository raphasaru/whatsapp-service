import { CONFIG } from "../config.js";

/**
 * WAHA API Service
 * Handles communication with the WAHA (WhatsApp HTTP API) container
 */

interface SendMessageResponse {
  id: string;
  timestamp: number;
}

interface MediaDownloadResult {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Send a text message to a WhatsApp number
 * @param to - The recipient's WhatsApp ID (format: 5511999999999@c.us)
 * @param text - The message text to send
 */
export async function sendMessage(
  to: string,
  text: string
): Promise<SendMessageResponse> {
  const url = `${CONFIG.WAHA_API_URL}/api/sendText`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: CONFIG.WAHA_SESSION,
      chatId: to,
      text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send message: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Download media from a WAHA media URL
 * @param mediaUrl - The URL of the media to download
 */
export async function downloadMedia(
  mediaUrl: string
): Promise<MediaDownloadResult> {
  // If the URL is relative, prepend the WAHA API URL
  const fullUrl = mediaUrl.startsWith("http")
    ? mediaUrl
    : `${CONFIG.WAHA_API_URL}${mediaUrl}`;

  const response = await fetch(fullUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download media: ${response.status} - ${response.statusText}`
    );
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    mimeType: contentType,
  };
}

/**
 * Send a message with media (image, audio, document)
 * @param to - The recipient's WhatsApp ID
 * @param mediaUrl - URL of the media to send
 * @param caption - Optional caption for the media
 */
export async function sendMedia(
  to: string,
  mediaUrl: string,
  caption?: string
): Promise<SendMessageResponse> {
  const url = `${CONFIG.WAHA_API_URL}/api/sendImage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: CONFIG.WAHA_SESSION,
      chatId: to,
      file: {
        url: mediaUrl,
      },
      caption,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send media: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Check if the WAHA session is connected
 */
export async function isSessionConnected(): Promise<boolean> {
  try {
    const url = `${CONFIG.WAHA_API_URL}/api/sessions/${CONFIG.WAHA_SESSION}`;
    const response = await fetch(url);

    if (!response.ok) return false;

    const data = await response.json();
    return data.status === "WORKING";
  } catch {
    return false;
  }
}

/**
 * Get session status information
 */
export async function getSessionStatus(): Promise<{
  status: string;
  me?: { id: string; pushName: string };
}> {
  const url = `${CONFIG.WAHA_API_URL}/api/sessions/${CONFIG.WAHA_SESSION}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to get session status: ${response.status}`);
  }

  return response.json();
}
