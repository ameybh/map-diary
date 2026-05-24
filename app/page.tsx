import { MapDiaryApp } from "@/components/map-diary-app";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { ensureProfile, profileFromUser } from "@/lib/supabase/diary";

export default async function Home() {
  const configured = isSupabaseConfigured();
  let initialUser = null;

  if (configured) {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      await ensureProfile(supabase, user);
      const profile = profileFromUser(user);
      initialUser = {
        id: user.id,
        email: user.email ?? "",
        displayName: profile.displayName,
        avatarUrl: user.user_metadata?.avatar_url as string | undefined
      };
    }
  }

  return <MapDiaryApp initialUser={initialUser} supabaseConfigured={configured} />;
}
