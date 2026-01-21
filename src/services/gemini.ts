import { GoogleGenerativeAI } from "@google/generative-ai";
import { CONFIG } from "../config.js";
import { EXTRACTION_PROMPT } from "../prompts/extract.js";

const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);

export interface ExtractedTransaction {
  description: string;
  amount: number;
  type: "income" | "expense";
  category: string | null;
}

export interface ExtractionResult {
  transactions: ExtractedTransaction[];
  confidence: number;
}

export async function extractTransactions(
  text: string | null,
  mediaBuffer: Buffer | null,
  mimeType: string | null
): Promise<ExtractionResult> {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  // Add the system prompt
  parts.push({ text: EXTRACTION_PROMPT });

  // Add the user input
  if (text) {
    parts.push({ text: `\n\nEntrada do usuário: ${text}` });
  }

  if (mediaBuffer && mimeType) {
    // Add media as inline data
    parts.push({
      inlineData: {
        mimeType,
        data: mediaBuffer.toString("base64"),
      },
    });

    if (mimeType.startsWith("audio/")) {
      parts.push({
        text: "\n\nTranscreva o áudio acima e extraia as transações mencionadas.",
      });
    } else if (mimeType.startsWith("image/")) {
      parts.push({
        text: "\n\nAnalise a imagem acima (cupom fiscal, comprovante, etc) e extraia as transações.",
      });
    }
  }

  try {
    const result = await model.generateContent(parts);
    const response = result.response;
    const responseText = response.text();

    // Parse the JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in response:", responseText);
      return { transactions: [], confidence: 0 };
    }

    const parsed = JSON.parse(jsonMatch[0]) as ExtractionResult;

    // Validate the response structure
    if (!Array.isArray(parsed.transactions)) {
      return { transactions: [], confidence: 0 };
    }

    // Validate each transaction
    const validTransactions = parsed.transactions.filter(
      (tx) =>
        typeof tx.description === "string" &&
        typeof tx.amount === "number" &&
        tx.amount > 0 &&
        (tx.type === "income" || tx.type === "expense")
    );

    return {
      transactions: validTransactions,
      confidence: parsed.confidence || 0.5,
    };
  } catch (error) {
    console.error("Gemini extraction error:", error);
    return { transactions: [], confidence: 0 };
  }
}
