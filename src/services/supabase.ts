import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "../config.js";
import { encryptTransactionFields } from "../utils/crypto.js";

// Using service role key to bypass RLS
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY);

export interface WhatsAppLink {
  id: string;
  user_id: string;
  phone_number: string;
  whatsapp_lid: string | null;
  verification_code: string | null;
  verification_expires_at: string | null;
  verified_at: string | null;
  created_at: string;
}

export interface TransactionInsert {
  user_id: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  category: string | null;
  due_date: string;
  status: "planned" | "completed";
  notes?: string;
}

export async function getUserByPhone(
  phoneNumber: string
): Promise<WhatsAppLink | null> {
  // Try with the phone number as-is
  let { data, error } = await supabase
    .from("user_whatsapp_links")
    .select("*")
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user by phone:", error);
    return null;
  }

  if (data) return data;

  // Try with 55 prefix if not found
  if (!phoneNumber.startsWith("55")) {
    const withPrefix = "55" + phoneNumber;
    const result = await supabase
      .from("user_whatsapp_links")
      .select("*")
      .eq("phone_number", withPrefix)
      .maybeSingle();

    if (result.error) {
      console.error("Error fetching user by phone with prefix:", result.error);
      return null;
    }

    return result.data;
  }

  return null;
}

export async function createTransaction(
  transaction: TransactionInsert
): Promise<void> {
  const encrypted = encryptTransactionFields(
    transaction as unknown as Record<string, unknown>,
    CONFIG.ENCRYPTION_KEY
  );

  const { error } = await supabase.from("transactions").insert(encrypted);

  if (error) {
    throw new Error(`Failed to create transaction: ${error.message}`);
  }
}

export async function markPhoneVerified(phoneNumber: string): Promise<void> {
  const { error } = await supabase
    .from("user_whatsapp_links")
    .update({ verified_at: new Date().toISOString() })
    .eq("phone_number", phoneNumber);

  if (error) {
    console.error("Error marking phone as verified:", error);
  }
}

/**
 * Look up user by WhatsApp LID (Linked ID)
 */
export async function getUserByLid(lid: string): Promise<WhatsAppLink | null> {
  const { data, error } = await supabase
    .from("user_whatsapp_links")
    .select("*")
    .eq("whatsapp_lid", lid)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user by LID:", error);
    return null;
  }

  return data;
}

/**
 * Find user by verification code and link their LID
 */
export async function verifyAndLinkLid(
  verificationCode: string,
  lid: string
): Promise<WhatsAppLink | null> {
  // Find user with this verification code that hasn't expired
  const { data, error } = await supabase
    .from("user_whatsapp_links")
    .select("*")
    .eq("verification_code", verificationCode.toUpperCase())
    .gt("verification_expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error("Error finding verification code:", error);
    return null;
  }

  if (!data) {
    return null;
  }

  // Link the LID to this user and clear verification code
  const { error: updateError } = await supabase
    .from("user_whatsapp_links")
    .update({
      whatsapp_lid: lid,
      verification_code: null,
      verification_expires_at: null,
      verified_at: new Date().toISOString(),
    })
    .eq("id", data.id);

  if (updateError) {
    console.error("Error linking LID:", updateError);
    return null;
  }

  return { ...data, whatsapp_lid: lid, verified_at: new Date().toISOString() };
}

// Subscription and WhatsApp limits
export interface WhatsAppLimitResult {
  success: boolean;
  messages_used: number;
  messages_limit: number;
}

const FREE_WHATSAPP_LIMIT = 30;

/**
 * Check and increment WhatsApp message count for a user.
 * Returns whether the user can send a message and their current usage.
 */
export async function checkAndIncrementWhatsAppLimit(
  userId: string
): Promise<WhatsAppLimitResult> {
  // Use the database function to increment and check limit
  const { data, error } = await supabase.rpc("increment_whatsapp_message", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Error checking WhatsApp limit:", error);
    // Fail open - allow the message on error
    return {
      success: true,
      messages_used: 0,
      messages_limit: FREE_WHATSAPP_LIMIT,
    };
  }

  const result = data?.[0];
  if (!result) {
    return {
      success: true,
      messages_used: 0,
      messages_limit: FREE_WHATSAPP_LIMIT,
    };
  }

  return {
    success: result.success,
    messages_used: result.messages_used,
    messages_limit: result.messages_limit,
  };
}

/**
 * Get current WhatsApp usage for a user without incrementing.
 */
export async function getWhatsAppUsage(
  userId: string
): Promise<{ messages_used: number; messages_limit: number }> {
  const { data, error } = await supabase.rpc("reset_whatsapp_messages_if_needed", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Error getting WhatsApp usage:", error);
    return { messages_used: 0, messages_limit: FREE_WHATSAPP_LIMIT };
  }

  const result = data?.[0];
  if (!result) {
    return { messages_used: 0, messages_limit: FREE_WHATSAPP_LIMIT };
  }

  return {
    messages_used: result.messages_used,
    messages_limit: result.messages_limit,
  };
}
