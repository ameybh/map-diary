<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of your project. PostHog is now initialized through `instrumentation-client.ts`, routed through a Next.js `/ingest` reverse proxy, and guarded by client/server helpers so local development keeps working when PostHog env vars are missing. The app now identifies authenticated Supabase users, resets identity on logout/local mode, captures core product actions, captures server-side auth events, and reports relevant client/server exceptions.

| Event name | Event description | File |
| --- | --- | --- |
| `oauth_login_started` | A visitor started Google OAuth sign-in from the login screen. | `components/map-diary-app.tsx` |
| `local_mode_started` | A visitor chose local browser mode instead of cloud sync. | `components/map-diary-app.tsx` |
| `auth_callback_completed` | The server completed an OAuth callback and exchanged the code for a Supabase session. | `app/auth/callback/route.ts` |
| `auth_callback_failed` | The server could not complete an OAuth callback. | `app/auth/callback/route.ts` |
| `user_logged_out` | An authenticated user signed out. | `app/auth/logout/route.ts` |
| `place_draft_started` | A user began creating a place from the map or location search. | `components/map-diary-app.tsx` |
| `place_saved` | A user created or updated a diary place. | `components/map-diary-app.tsx` |
| `place_deleted` | A user deleted a diary place. | `components/map-diary-app.tsx` |
| `photo_removed` | A user removed a photo from a diary place. | `components/map-diary-app.tsx` |
| `friend_added` | A user added a friend to their diary network. | `components/map-diary-app.tsx` |
| `profile_updated` | A user saved account/profile preferences. | `components/map-diary-app.tsx` |
| `theme_updated` | A user changed scrapbook visual settings. | `components/map-diary-app.tsx` |
| `sync_requested` | A user manually requested sync. | `components/map-diary-app.tsx` |
| `sync_failed` | A sync attempt failed on the client. | `components/map-diary-app.tsx` |
| `data_exported` | A user exported their local diary JSON. | `components/map-diary-app.tsx` |
| `data_imported` | A user imported diary JSON. | `components/map-diary-app.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- Dashboard: Not created in this already-running Codex session. The PostHog MCP server is configured in `/home/amey/.codex/config.toml` as `https://mcp.posthog.com/mcp`, and `codex mcp login posthog` completed successfully. This live agent session still does not expose newly configured MCP tools; open a fresh Codex session to create the dashboard from the suggested insights below.
- Suggested insight: Auth funnel from `oauth_login_started` to `auth_callback_completed`.
- Suggested insight: Place creation funnel from `place_draft_started` to `place_saved`.
- Suggested insight: Cloud engagement by `sync_requested`, `sync_failed`, and `user_logged_out`.
- Suggested insight: Collaboration activity by `friend_added` and shared `place_saved` properties.
- Suggested insight: Data portability by `data_exported` and `data_imported`.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
