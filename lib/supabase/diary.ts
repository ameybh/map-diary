import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AppState, DiaryEntry, EntryIcon, EntryPhoto, EntryVisibility, Friend, Profile, ThemeSettings } from "@/lib/types";
import { CURRENT_USER_ID, normalizeState } from "@/lib/seed";

const PHOTO_BUCKET = "place-photos";

type EntryRow = {
  id: string;
  owner_id: string;
  title: string;
  place_name: string;
  note: string | null;
  lat: number;
  lng: number;
  icon: EntryIcon;
  color: string;
  visibility: EntryVisibility;
  created_at: string;
  updated_at: string;
  entry_mates?: Array<{ user_id: string }>;
  entry_photos?: Array<{
    id: string;
    storage_path: string;
    filename: string;
    content_type: string | null;
    size: number | null;
    created_at: string;
  }>;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  theme: Partial<ThemeSettings> | null;
  feed_visible: boolean;
  private_by_default: boolean;
};

type FriendshipRow = {
  addressee: ProfileRow | null;
};

export function profileFromUser(user: User): Profile {
  const name =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Map Diary User";

  return {
    id: user.id,
    displayName: name,
    username: user.email?.split("@")[0]?.replace(/[^a-z0-9_.-]/gi, "").toLowerCase() || "traveler",
    email: user.email ?? "",
    feedVisible: true,
    privateByDefault: true,
    preferredIcon: "heart"
  };
}

export async function ensureProfile(supabase: SupabaseClient, user: User) {
  const profile = profileFromUser(user);
  await supabase.from("profiles").upsert(
    {
      id: user.id,
      username: profile.username,
      display_name: profile.displayName,
      email: profile.email,
      avatar_url: user.user_metadata?.avatar_url ?? null,
      feed_visible: profile.feedVisible,
      private_by_default: profile.privateByDefault,
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );
}

export async function loadCloudState(supabase: SupabaseClient, localState: AppState, userId: string): Promise<AppState> {
  const [profileResult, entriesResult, friendshipsResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase
      .from("entries")
      .select("*, entry_mates(user_id), entry_photos(id, storage_path, filename, content_type, size, created_at)")
      .order("updated_at", { ascending: false }),
    supabase.from("friendships").select("*, addressee:profiles!friendships_addressee_id_fkey(*)").eq("requester_id", userId)
  ]);

  const profile = profileResult.data
    ? profileFromRow(profileResult.data as ProfileRow, localState.profile)
    : localState.profile;

  const friends = friendshipsResult.data?.length
    ? friendshipsResult.data
        .map((row) => (row as FriendshipRow).addressee)
        .filter((row): row is ProfileRow => Boolean(row))
        .map((row: ProfileRow): Friend => ({
          id: row.id,
          displayName: row.display_name,
          username: row.username ?? row.email ?? "friend",
          email: row.email ?? "",
          following: true,
          followsYou: false,
          feedVisible: true,
          color: "mint"
        }))
    : localState.friends;

  const entries = entriesResult.data?.length
    ? await Promise.all((entriesResult.data as EntryRow[]).map((row) => entryFromRow(supabase, row)))
    : localState.entries.filter((entry) => entry.ownerId === CURRENT_USER_ID);

  return normalizeState({
    ...localState,
    profile,
    settings: {
      ...localState.settings,
      theme: {
        ...localState.settings.theme,
        ...(profileResult.data ? ((profileResult.data as ProfileRow).theme ?? {}) : {})
      }
    },
    friends,
    entries,
    sync: {
      ...localState.sync,
      remote: "Supabase",
      status: "synced",
      pendingChanges: 0,
      lastSyncedAt: new Date().toISOString()
    }
  });
}

export async function saveEntryToCloud(
  supabase: SupabaseClient,
  userId: string,
  entry: DiaryEntry,
  files: FileList | null
) {
  await supabase.from("entries").upsert(
    {
      id: entry.id,
      owner_id: userId,
      title: entry.title,
      place_name: entry.placeName,
      note: entry.note,
      lat: entry.lat,
      lng: entry.lng,
      icon: entry.icon,
      color: entry.color,
      visibility: entry.visibility,
      created_at: entry.createdAt,
      updated_at: entry.updatedAt
    },
    { onConflict: "id" }
  );

  await supabase.from("entry_mates").delete().eq("entry_id", entry.id);
  const cloudMateIds = entry.mates.filter(isUuid);
  if (cloudMateIds.length) {
    await supabase.from("entry_mates").insert(cloudMateIds.map((mateId) => ({ entry_id: entry.id, user_id: mateId })));
  }

  const uploadedPhotos: EntryPhoto[] = [];
  for (const file of Array.from(files ?? [])) {
    if (!file.type.startsWith("image/")) continue;

    const photoId = crypto.randomUUID();
    const storagePath = `${userId}/${entry.id}/${photoId}-${safeFilename(file.name)}`;
    const upload = await supabase.storage.from(PHOTO_BUCKET).upload(storagePath, file, {
      cacheControl: "31536000",
      upsert: false
    });

    if (upload.error) throw upload.error;

    const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(storagePath, 60 * 60 * 24);
    await supabase.from("entry_photos").insert({
      id: photoId,
      entry_id: entry.id,
      owner_id: userId,
      storage_path: storagePath,
      filename: file.name,
      content_type: file.type,
      size: file.size
    });

    uploadedPhotos.push({
      id: photoId,
      name: file.name,
      type: file.type,
      size: file.size,
      storagePath,
      signedUrl: data?.signedUrl,
      createdAt: new Date().toISOString()
    });
  }

  return uploadedPhotos;
}

export async function deleteEntryFromCloud(supabase: SupabaseClient, entryId: string) {
  await supabase.from("entries").delete().eq("id", entryId);
}

export async function deletePhotoFromCloud(supabase: SupabaseClient, photo: EntryPhoto) {
  if (photo.storagePath) {
    await supabase.storage.from(PHOTO_BUCKET).remove([photo.storagePath]);
  }
  await supabase.from("entry_photos").delete().eq("id", photo.id);
}

export async function searchProfiles(supabase: SupabaseClient, query: string, currentUserId: string) {
  if (!query.trim()) return [];

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .or(`username.ilike.%${query}%,email.ilike.%${query}%,display_name.ilike.%${query}%`)
    .neq("id", currentUserId)
    .limit(12);

  return (data ?? []).map((row: ProfileRow): Friend => ({
    id: row.id,
    displayName: row.display_name,
    username: row.username ?? row.email ?? "friend",
    email: row.email ?? "",
    following: false,
    followsYou: false,
    feedVisible: true,
    color: "mint"
  }));
}

export async function addFriendToCloud(supabase: SupabaseClient, userId: string, friendId: string) {
  await supabase.from("friendships").upsert(
    {
      requester_id: userId,
      addressee_id: friendId,
      status: "accepted"
    },
    { onConflict: "requester_id,addressee_id" }
  );
}

export async function saveProfileToCloud(supabase: SupabaseClient, profile: Profile) {
  await supabase.from("profiles").upsert(
    {
      id: profile.id,
      username: profile.username,
      display_name: profile.displayName,
      email: profile.email,
      feed_visible: profile.feedVisible,
      private_by_default: profile.privateByDefault,
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );
}

export async function saveThemeToCloud(supabase: SupabaseClient, userId: string, theme: ThemeSettings) {
  await supabase
    .from("profiles")
    .update({
      theme,
      updated_at: new Date().toISOString()
    })
    .eq("id", userId);
}

function profileFromRow(row: ProfileRow, fallback: Profile): Profile {
  return {
    ...fallback,
    id: row.id,
    displayName: row.display_name,
    username: row.username ?? fallback.username,
    email: row.email ?? fallback.email,
    feedVisible: row.feed_visible,
    privateByDefault: row.private_by_default
  };
}

async function entryFromRow(supabase: SupabaseClient, row: EntryRow): Promise<DiaryEntry> {
  const photos = await Promise.all(
    (row.entry_photos ?? []).map(async (photo) => {
      const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(photo.storage_path, 60 * 60 * 24);
      return {
        id: photo.id,
        name: photo.filename,
        type: photo.content_type ?? "image/jpeg",
        size: photo.size ?? 0,
        storagePath: photo.storage_path,
        signedUrl: data?.signedUrl,
        createdAt: photo.created_at
      };
    })
  );

  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    placeName: row.place_name,
    note: row.note ?? "",
    lat: row.lat,
    lng: row.lng,
    icon: row.icon,
    color: row.color,
    visibility: row.visibility,
    mates: (row.entry_mates ?? []).map((mate) => mate.user_id),
    photos,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function safeFilename(filename: string) {
  return filename.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
