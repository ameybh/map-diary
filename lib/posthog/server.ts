import { PostHog } from "posthog-node";

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? process.env.NEXT_PUBLIC_POSTHOG_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export function createPostHogServerClient() {
  if (!posthogToken) return null;

  return new PostHog(posthogToken, {
    host: posthogHost,
    flushAt: 1,
    flushInterval: 0
  });
}

export function postHogDistinctIdFromHeaders(headers: Headers) {
  return headers.get("X-POSTHOG-DISTINCT-ID") ?? undefined;
}

export async function captureServerEvent({
  distinctId,
  event,
  properties,
  error,
  personProperties
}: {
  distinctId?: string;
  event: string;
  properties?: Record<string, unknown>;
  error?: unknown;
  personProperties?: Record<string, unknown>;
}) {
  const posthog = createPostHogServerClient();
  if (!posthog || !distinctId) return;

  try {
    if (personProperties) {
      posthog.identify({
        distinctId,
        properties: personProperties
      });
    }

    posthog.capture({
      distinctId,
      event,
      properties
    });

    if (error) {
      posthog.captureException(error, distinctId, properties);
    }
  } finally {
    await posthog.shutdown();
  }
}
