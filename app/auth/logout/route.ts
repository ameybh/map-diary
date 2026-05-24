import { NextResponse } from "next/server";
import { captureServerEvent, postHogDistinctIdFromHeaders } from "@/lib/posthog/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    await captureServerEvent({
      distinctId: user?.id ?? postHogDistinctIdFromHeaders(request.headers),
      event: "user_logged_out",
      properties: {
        method: "POST",
        had_user: Boolean(user)
      }
    });

    await supabase.auth.signOut();
  }

  return NextResponse.redirect(new URL("/", request.url), 303);
}

export async function GET(request: Request) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    await captureServerEvent({
      distinctId: user?.id ?? postHogDistinctIdFromHeaders(request.headers),
      event: "user_logged_out",
      properties: {
        method: "GET",
        had_user: Boolean(user)
      }
    });

    await supabase.auth.signOut();
  }

  return NextResponse.redirect(new URL("/", request.url));
}
