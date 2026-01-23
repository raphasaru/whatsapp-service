import { Request, Response } from "express";
import { extractTransactions } from "../services/gemini.js";
import {
  getUserByLid,
  verifyAndLinkLid,
  createTransaction,
  WhatsAppLink,
} from "../services/supabase.js";
import { sendMessage, downloadMedia } from "../services/waha.js";
import { formatCurrency } from "../utils/format.js";

interface WahaMessage {
  event: string;
  session: string;
  payload: {
    id: string;
    timestamp: number;
    from: string;
    to: string;
    fromMe: boolean;
    body?: string;
    hasMedia: boolean;
    mediaUrl?: string;
    type: "chat" | "image" | "ptt" | "audio" | "video" | "document";
    participant?: string;
    notifyName?: string;
    _data?: {
      from?: string;
      to?: string;
      participant?: string;
      notifyName?: string;
    };
  };
}

function extractLid(message: WahaMessage): string | null {
  const { from } = message.payload;

  // Extract LID from format like "226744275624053@lid"
  if (from && from.includes("@lid")) {
    return from.replace("@lid", "");
  }

  // Also handle regular format for backwards compatibility
  if (from && from.includes("@c.us")) {
    return from.replace("@c.us", "");
  }

  return null;
}

function isVerificationCode(text: string): boolean {
  // Verification codes are 6 uppercase alphanumeric characters
  return /^[A-Z0-9]{6}$/.test(text.trim().toUpperCase());
}

async function handleVerification(
  from: string,
  code: string
): Promise<WhatsAppLink | null> {
  const lid = from.replace("@lid", "").replace("@c.us", "");
  const user = await verifyAndLinkLid(code.toUpperCase(), lid);
  return user;
}

async function processTransaction(
  user: WhatsAppLink,
  from: string,
  content: string | null,
  mediaBuffer: Buffer | null,
  mimeType: string | null
): Promise<void> {
  // Extract transactions using Gemini
  const result = await extractTransactions(content, mediaBuffer, mimeType);

  if (!result.transactions || result.transactions.length === 0) {
    await sendMessage(
      from,
      "Não consegui identificar nenhuma transação na sua mensagem. Tente algo como 'gastei 50 no uber' ou 'recebi 3000 de salário'."
    );
    return;
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
        ? `✅ Transação registrada!\n\n${created[0]}`
        : `✅ ${created.length} transações registradas!\n\n${created.join("\n")}`;

    await sendMessage(from, confirmationMessage);
  }
}

export async function handleWahaWebhook(req: Request, res: Response) {
  try {
    const message = req.body as WahaMessage;

    // Log full payload for debugging
    console.log("Webhook received:", JSON.stringify(message, null, 2));

    // Only process incoming messages
    if (message.event !== "message" || message.payload.fromMe) {
      return res.status(200).json({ ok: true });
    }

    const { from, body, type, hasMedia, mediaUrl } = message.payload;

    // Extract LID from sender
    const lid = extractLid(message);
    if (!lid) {
      console.log(`Could not extract LID from: ${from}`);
      return res.status(200).json({ ok: true, message: "Could not extract LID" });
    }

    console.log(`Processing message from LID: ${lid}`);

    // First, try to find user by LID
    let user = await getUserByLid(lid);

    // If user not found and it's a text message, check if it's a verification code
    if (!user && type === "chat" && body) {
      const trimmedBody = body.trim();

      if (isVerificationCode(trimmedBody)) {
        console.log(`Attempting verification with code: ${trimmedBody}`);
        user = await handleVerification(from, trimmedBody);

        if (user) {
          await sendMessage(
            from,
            `✅ WhatsApp vinculado com sucesso!\n\nAgora você pode enviar suas transações por aqui. Exemplos:\n\n• "gastei 50 no uber"\n• "recebi 3000 de salário"\n• "almocei 35 reais"\n\nTambém aceito áudios e fotos de comprovantes!`
          );
          return res.status(200).json({ ok: true, verified: true });
        } else {
          await sendMessage(
            from,
            "❌ Código de verificação inválido ou expirado.\n\nAcesse o app Meu Bolso em Configurações > WhatsApp para gerar um novo código."
          );
          return res.status(200).json({ ok: true, message: "Invalid verification code" });
        }
      }

      // Not a verification code and user not found
      await sendMessage(
        from,
        "👋 Olá! Para usar o Meu Bolso via WhatsApp, primeiro você precisa vincular seu número.\n\n1. Acesse o app Meu Bolso\n2. Vá em Configurações > WhatsApp\n3. Gere um código de verificação\n4. Envie o código aqui\n\nSe já tem um código, envie ele agora!"
      );
      return res.status(200).json({ ok: true, message: "User not registered" });
    }

    // User not found and not a text message
    if (!user) {
      console.log(`User not found for LID: ${lid}`);
      await sendMessage(
        from,
        "👋 Para usar o Meu Bolso via WhatsApp, vincule seu número primeiro.\n\nAcesse o app > Configurações > WhatsApp e envie o código de verificação aqui."
      );
      return res.status(200).json({ ok: true, message: "User not registered" });
    }

    // User found - process the message
    console.log(`User found: ${user.user_id}`);

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

    await processTransaction(user, from, content, mediaBuffer, mimeType);

    return res.status(200).json({ ok: true, processed: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
