import { NextResponse } from "next/server";
import { captureServerEvent, postHogDistinctIdFromHeaders } from "@/lib/posthog/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/";

  if (!next.startsWith("/")) next = "/";

  if (!isSupabaseConfigured()) {
    await captureServerEvent({
      distinctId: postHogDistinctIdFromHeaders(request.headers) ?? "server:auth_callback",
      event: "auth_callback_failed",
      properties: {
        reason: "supabase_not_configured",
        next_path: next
      }
    });
    return NextResponse.redirect(`${origin}/?auth_error=supabase_not_configured`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      await captureServerEvent({
        distinctId: user?.id ?? postHogDistinctIdFromHeaders(request.headers),
        event: "auth_callback_completed",
        properties: {
          next_path: next,
          provider: "google",
          has_email: Boolean(user?.email)
        },
        personProperties: user
          ? {
              email: user.email,
              name: user.user_metadata?.full_name ?? user.user_metadata?.name,
              avatar_url: user.user_metadata?.avatar_url
            }
          : undefined
      });

      return NextResponse.redirect(`${origin}${next}`);
    }

    await captureServerEvent({
      distinctId: postHogDistinctIdFromHeaders(request.headers) ?? "server:auth_callback",
      event: "auth_callback_failed",
      properties: {
        reason: error.message,
        next_path: next,
        provider: "google"
      },
      error
    });

    return NextResponse.redirect(`${origin}/?auth_error=oauth_callback_failed`);
  }

  await captureServerEvent({
    distinctId: postHogDistinctIdFromHeaders(request.headers) ?? "server:auth_callback",
    event: "auth_callback_failed",
    properties: {
      reason: code ? "oauth_callback_failed" : "missing_code",
      next_path: next,
      provider: "google"
    }
  });

  return NextResponse.redirect(`${origin}/?auth_error=oauth_callback_failed`);
}
