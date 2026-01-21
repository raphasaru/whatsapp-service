import { Request, Response } from "express";
import { extractTransactions } from "../services/gemini.js";
import { getUserByPhone, createTransaction } from "../services/supabase.js";
import { sendMessage, downloadMedia } from "../services/waha.js";
import { formatCurrency } from "../utils/format.js";

interface WahaMessage {
  event: string;
  session: string;
  payload: {
    id: string;
    timestamp: number;
    from: string;
    fromMe: boolean;
    body?: string;
    hasMedia: boolean;
    mediaUrl?: string;
    type: "chat" | "image" | "ptt" | "audio" | "video" | "document";
  };
}

export async function handleWahaWebhook(req: Request, res: Response) {
  try {
    const message = req.body as WahaMessage;

    // Only process incoming messages
    if (message.event !== "message" || message.payload.fromMe) {
      return res.status(200).json({ ok: true });
    }

    const { from, body, type, hasMedia, mediaUrl } = message.payload;

    // Extract phone number (remove @c.us suffix)
    const phoneNumber = from.replace("@c.us", "");

    // Find user by phone number
    const user = await getUserByPhone(phoneNumber);
    if (!user) {
      console.log(`Unknown phone number: ${phoneNumber}`);
      return res.status(200).json({ ok: true, message: "Unknown user" });
    }

    let content: string | null = null;
    let mediaBuffer: Buffer | null = null;
    let mimeType: string | null = null;

    // Handle different message types
    if (type === "chat" && body) {
      content = body;
    } else if ((type === "ptt" || type === "audio") && hasMedia && mediaUrl) {
      // Download audio and send to Gemini for transcription + extraction
      const media = await downloadMedia(mediaUrl);
      mediaBuffer = media.buffer;
      mimeType = media.mimeType;
    } else if (type === "image" && hasMedia && mediaUrl) {
      // Download image and send to Gemini for OCR + extraction
      const media = await downloadMedia(mediaUrl);
      mediaBuffer = media.buffer;
      mimeType = media.mimeType;
    } else {
      // Unsupported message type
      await sendMessage(
        from,
        "Desculpe, só consigo processar mensagens de texto, áudio ou imagem."
      );
      return res.status(200).json({ ok: true });
    }

    // Extract transactions using Gemini
    const result = await extractTransactions(content, mediaBuffer, mimeType);

    if (!result.transactions || result.transactions.length === 0) {
      await sendMessage(
        from,
        "Não consegui identificar nenhuma transação na sua mensagem. Tente algo como 'gastei 50 no uber' ou 'recebi 3000 de salário'."
      );
      return res.status(200).json({ ok: true });
    }

    // Create transactions in Supabase
    const created: string[] = [];
    const today = new Date().toISOString().split("T")[0];

    for (const tx of result.transactions) {
      try {
        await createTransaction({
          user_id: user.user_id,
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          category: tx.category,
          due_date: today,
          status: "planned",
          notes: "Criado via WhatsApp",
        });

        const emoji = tx.type === "income" ? "💰" : "💸";
        created.push(`${emoji} ${tx.description}: ${formatCurrency(tx.amount)}`);
      } catch (error) {
        console.error("Error creating transaction:", error);
      }
    }

    // Send confirmation
    if (created.length > 0) {
      const confirmationMessage =
        created.length === 1
          ? `Transação registrada!\n\n${created[0]}`
          : `${created.length} transações registradas!\n\n${created.join("\n")}`;

      await sendMessage(from, confirmationMessage);
    }

    return res.status(200).json({ ok: true, created: created.length });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
