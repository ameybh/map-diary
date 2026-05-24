"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }

  if (!browserClient) {
    browserClient = createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey());
  }

  return browserClient;
}
