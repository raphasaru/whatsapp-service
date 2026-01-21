import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "../config.js";

// Using service role key to bypass RLS
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY);

export interface WhatsAppLink {
  id: string;
  user_id: string;
  phone_number: string;
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
  const { error } = await supabase.from("transactions").insert(transaction);

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
