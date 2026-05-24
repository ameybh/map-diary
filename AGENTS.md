# AGENTS.md

## Project Shape

This is a Next.js app-router application for a local-first map diary. The primary experience lives in `components/map-diary-app.tsx`, with server bootstrap in `app/page.tsx`, shared types in `lib/types.ts`, local persistence in `lib/local-store.ts`, Supabase integration under `lib/supabase/`, and analytics wrappers under `lib/posthog/`.

Use `DESIGN.md` as the source of truth for visual direction. The implemented design tokens live in `app/globals.css`; prefer those CSS variables and the existing UI primitives over one-off styles.

## Commands

- `npm run dev` starts the local app.
- `npm run build` validates the production Next.js build.
- `npm run lint` runs ESLint.
- `npm run typecheck` runs TypeScript without emitting files.

Run `npm run lint` and `npm run typecheck` after meaningful code changes. Run `npm run build` for changes that touch routing, server/client boundaries, auth, or data loading.

## Building Pattern

- Keep route files thin. `app/page.tsx` should gather server-side context and pass serializable props into feature components.
- Keep app-level interaction state inside `MapDiaryApp` unless a piece of state is clearly reusable across features.
- Put shared domain shapes in `lib/types.ts`. Extend the existing `AppState`, `DiaryEntry`, `Profile`, and related types instead of creating parallel shapes.
- Keep pure helpers in `lib/utils.ts`; keep map-specific data and location helpers in `lib/map.ts`; keep seed/default state behavior in `lib/seed.ts`.
- Use the existing local-first path as the baseline. Changes should continue to work without Supabase configured, then enhance behavior when `supabaseConfigured` and an authenticated user are present.
- Use the existing Supabase wrapper modules. Browser code imports `createClient` from `lib/supabase/client.ts`; server code imports from `lib/supabase/server.ts`; diary CRUD belongs in `lib/supabase/diary.ts`.
- Use the PostHog helper functions in `lib/posthog/client.ts` and `lib/posthog/server.ts`. Do not import SDKs throughout feature components.
- Use `captureAppEvent` from `MapDiaryApp` for product events so common user/cloud/demo properties stay consistent.

## React And Next.js Rules

- Add `"use client"` only to components that need browser APIs, React state/effects, event handlers, or client-only libraries.
- Dynamically import browser-only map components with SSR disabled, following the existing Leaflet pattern.
- Keep server/client props serializable. Do not pass Supabase clients, functions, class instances, or browser-only objects across the boundary.
- Prefer explicit TypeScript unions for UI modes, filters, icon choices, and map styles.
- Use functional state updates when deriving the next value from the current value.
- Avoid broad refactors inside `components/map-diary-app.tsx`; it is large, so changes should be tightly scoped and easy to review.

## Design System Rules

- Follow `DESIGN.md`: monochrome core, confident black ink on white canvas, and large pastel color blocks as the signature visual device.
- Use CSS variables from `app/globals.css` for colors and radii: `--canvas`, `--ink`, `--primary`, `--surface-soft`, `--hairline`, `--block-*`, `--accent-magenta`, and radius tokens.
- Use existing primitives from `components/ui/` for buttons, badges, labels, inputs, selects, and textareas. Add variants there when a pattern repeats.
- Buttons are pills by default. Icon buttons are circular. Do not introduce square CTAs.
- Prefer `lucide-react` icons for interactive controls and feature labels.
- Keep surfaces flat. Use hairline borders and color blocks before adding shadows.
- Use magenta sparingly for focus rings, selected markers, or strong promotional actions. It should not become a general accent wash.
- Keep typography close to the established Tailwind/CSS-token setup. The app uses the Figma-inspired sans/mono stack from `globals.css`; do not introduce unrelated typefaces.
- Avoid gradients, decorative blobs, nested cards, and heavy shadow stacks. This design should feel editorial, crisp, and colorful through layout rather than effects.

## Styling Pattern

- Use Tailwind utility classes with `cn()` from `lib/utils.ts` for conditional class names.
- Prefer token-backed arbitrary values such as `bg-[var(--canvas)]`, `text-[var(--ink)]`, `border-[var(--hairline)]`, and `rounded-[var(--radius-md)]`.
- Add global CSS only for true global concerns, third-party library integration, map internals, or reusable CSS variables.
- Keep responsive layout explicit with stable dimensions, `min-h`, grid tracks, and sensible breakpoints. Map and tool surfaces should not shift when labels or controls change.
- Respect `prefers-reduced-motion`; `globals.css` already includes a global reduction rule.

## Data And Persistence

- Preserve local-first behavior. IndexedDB/localStorage state should remain the fallback and demo-mode path.
- Normalize loaded or merged state through `normalizeState` before putting it into React state.
- Keep cloud sync additive. Supabase should not be required for the core diary experience.
- Store timestamps as ISO strings, matching the current `createdAt`, `updatedAt`, and sync fields.
- When adding new persisted fields, update the TypeScript types, seed/default normalization, local persistence assumptions, and Supabase mapping if the field should sync.
- For photo uploads, keep file validation and storage behavior inside Supabase diary helpers rather than feature UI.

## Authentication, Supabase, And Privacy

- Server routes and server components must use the server Supabase client so cookies/session handling stays correct.
- Client components must not access service-role secrets or server-only environment variables.
- Do not assume Supabase is configured. Guard cloud-only flows with `supabaseConfigured`, `initialUser`, and `demoMode`.
- Keep private diary content private by default. Be explicit when changing visibility, sharing, friend, or feed behavior.
- Use existing auth routes under `app/auth/` for login callback/logout behavior.

## Analytics

- Analytics must be optional. Every PostHog call should be a no-op when the public token is missing.
- Keep event names stable, lowercase, and action-oriented.
- Include useful context, but do not send full diary notes, private photo data, access tokens, or other sensitive content.
- Use `captureClientException` for recoverable client errors that should be visible in PostHog.

## Accessibility And UX

- Interactive elements should be real buttons, links, inputs, or labels as appropriate.
- Maintain visible focus states using the existing magenta focus ring pattern.
- Icon-only actions need an accessible label via `aria-label` or visible text.
- Forms should use `Label` from `components/ui/form-controls.tsx` and should keep validation/error copy close to the control.
- Keep empty, loading, offline, and error states first-class. The app is local-first and should feel usable while offline.

## Change Discipline

- Make narrow edits that follow the existing file boundaries.
- Do not rewrite `MapDiaryApp` wholesale unless the task is explicitly a refactor.
- Do not add new libraries for simple UI, state, dates, or formatting needs already covered by the repo.
- Keep generated or user data out of commits.
- Before finishing, check `git status --short` and report the files changed plus any validation that was run.
