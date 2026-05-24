"use client";

import posthog from "posthog-js";
import type { AuthUserSummary } from "@/lib/types";

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? process.env.NEXT_PUBLIC_POSTHOG_TOKEN;

export function isPostHogEnabled() {
  return Boolean(posthogToken);
}

export function identifyPostHogUser(user: AuthUserSummary) {
  if (!isPostHogEnabled()) return;

  posthog.identify(user.id, {
    email: user.email,
    name: user.displayName,
    avatar_url: user.avatarUrl
  });
}

export function resetPostHogUser() {
  if (!isPostHogEnabled()) return;

  posthog.reset();
}

export function captureClientEvent(event: string, properties?: Record<string, unknown>) {
  if (!isPostHogEnabled()) return;

  posthog.capture(event, properties);
}

export function captureClientException(error: unknown, properties?: Record<string, unknown>) {
  if (!isPostHogEnabled()) return;

  posthog.captureException(error, properties);
}

export function getPostHogRequestHeaders() {
  if (!isPostHogEnabled()) return {};

  return {
    "X-POSTHOG-DISTINCT-ID": posthog.get_distinct_id(),
    "X-POSTHOG-SESSION-ID": posthog.get_session_id()
  };
}
