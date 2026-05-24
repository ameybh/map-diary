"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import * as React from "react";
import {
  BookOpen,
  Circle,
  Cloud,
  Download,
  Heart,
  ImagePlus,
  LogOut,
  Map,
  MapPin,
  Palette,
  Plus,
  Rss,
  Search,
  Settings,
  Star,
  Type,
  Trash2,
  Upload,
  UserPlus,
  Users,
  WifiOff,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle
} from "@/components/ui/drawer";
import { Input, Label, Select, Textarea } from "@/components/ui/form-controls";
import { MiniMap } from "@/components/world-map";
import { mirrorToCloud, readState, writeState } from "@/lib/local-store";
import { cityAtlas, type DraftLocation } from "@/lib/map";
import {
  captureClientEvent,
  captureClientException,
  identifyPostHogUser,
  resetPostHogUser
} from "@/lib/posthog/client";
import { CURRENT_USER_ID, directory, normalizeState } from "@/lib/seed";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  addFriendToCloud,
  deleteEntryFromCloud,
  deletePhotoFromCloud,
  loadCloudState,
  saveEntryToCloud,
  saveProfileToCloud,
  saveThemeToCloud,
  searchProfiles
} from "@/lib/supabase/diary";
import type {
  AppState,
  AuthUserSummary,
  DiaryEntry,
  EntryIcon,
  EntryPhoto,
  EntryVisibility,
  Friend,
  MapTileStyle,
  ThemeSettings,
  ViewId
} from "@/lib/types";
import { cleanText, createId, formatBytes, formatDate, formatLatLng, initials } from "@/lib/utils";

const views: Array<{ id: ViewId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "map", label: "Map", icon: Map },
  { id: "scrapbook", label: "Places", icon: BookOpen },
  { id: "feed", label: "Feed", icon: Rss },
  { id: "friends", label: "Friends", icon: Users },
  { id: "settings", label: "Settings", icon: Settings }
];

const iconOptions: Array<{ id: EntryIcon; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "heart", label: "Heart", icon: Heart },
  { id: "pin", label: "Pin", icon: MapPin },
  { id: "star", label: "Star", icon: Star },
  { id: "dot", label: "Dot", icon: Circle }
];

const accentOptions = [
  { name: "Guava", value: "#ff5a7a" },
  { name: "Tangerine", value: "#f59e42" },
  { name: "Marigold", value: "#d8a91f" },
  { name: "Meadow", value: "#34a853" },
  { name: "Lagoon", value: "#2f80ed" },
  { name: "Lilac", value: "#8465d9" },
  { name: "Ink", value: "#111111" }
];

const fontOptions = [
  { name: "Figtree", family: "Figtree" },
  { name: "Nunito Sans", family: "Nunito Sans" },
  { name: "Quicksand", family: "Quicksand" },
  { name: "DM Sans", family: "DM Sans" },
  { name: "System", family: "System" }
];

const mapStyleOptions: Array<{ id: MapTileStyle; label: string }> = [
  { id: "colorful", label: "Colorful OSM" },
  { id: "voyager", label: "Voyager" },
  { id: "minimal", label: "Minimal" }
];

const DiaryLeafletMap = dynamic(
  () => import("@/components/leaflet-map").then((module) => module.DiaryLeafletMap),
  {
    ssr: false,
    loading: () => <MapLoading />
  }
);

type DraftEntry = Omit<DiaryEntry, "id" | "ownerId" | "createdAt" | "updatedAt"> & {
  id?: string;
  ownerId?: string;
};

type PlaceSort = "updated" | "created" | "name";
type PlaceFilter = "all" | "private" | "shared" | "with-photos";

interface MapDiaryAppProps {
  initialUser: AuthUserSummary | null;
  supabaseConfigured: boolean;
}

export function MapDiaryApp({ initialUser, supabaseConfigured }: MapDiaryAppProps) {
  const [state, setState] = React.useState<AppState | null>(null);
  const [activeView, setActiveView] = React.useState<ViewId>("map");
  const [selectedEntryId, setSelectedEntryId] = React.useState<string | null>(null);
  const [draftLocation, setDraftLocation] = React.useState<DraftLocation | null>(null);
  const [toast, setToast] = React.useState("");
  const [demoMode, setDemoMode] = React.useState(() => !supabaseConfigured);
  const [placeQuery, setPlaceQuery] = React.useState("");
  const [placeSort, setPlaceSort] = React.useState<PlaceSort>("updated");
  const [placeFilter, setPlaceFilter] = React.useState<PlaceFilter>("all");
  const [locationQuery, setLocationQuery] = React.useState("");
  const [remoteDirectory, setRemoteDirectory] = React.useState<Friend[]>([]);
  const [installPrompt, setInstallPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [isOnline, setIsOnline] = React.useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const channelRef = React.useRef<BroadcastChannel | null>(null);
  const syncTimerRef = React.useRef<number | null>(null);

  const userId = initialUser?.id ?? CURRENT_USER_ID;
  const isAuthenticated = Boolean(initialUser);
  const canUseCloud = Boolean(initialUser && supabaseConfigured && !demoMode);
  const isMobile = useIsMobile();
  useGoogleFont(state?.settings.theme.fontFamily ?? "Figtree");

  const showToast = React.useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  React.useEffect(() => {
    if (initialUser) {
      identifyPostHogUser(initialUser);
    }
  }, [initialUser]);

  function captureAppEvent(event: string, properties?: Record<string, unknown>) {
    captureClientEvent(event, {
      user_id: userId,
      is_authenticated: isAuthenticated,
      cloud_mode: canUseCloud,
      demo_mode: demoMode,
      ...properties
    });
  }

  React.useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const stored = await readState().catch(() => null);
      let next = normalizeState(stored);

      if (initialUser) {
        next = normalizeState({
          ...next,
          profile: {
            ...next.profile,
            id: initialUser.id,
            displayName: initialUser.displayName,
            username: next.profile.username || initialUser.email.split("@")[0] || "traveler",
            email: initialUser.email
          }
        });
      }

      if (initialUser && supabaseConfigured && !demoMode) {
        const supabase = createSupabaseBrowserClient();
        next = await loadCloudState(supabase, next, initialUser.id).catch(() => next);
      }

      if (!stored) await writeState(next);
      if (!cancelled) setState(next);
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [demoMode, initialUser, supabaseConfigured]);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  React.useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  React.useEffect(() => {
    if (!("BroadcastChannel" in window)) return;

    const channel = new BroadcastChannel("map-diary");
    channelRef.current = channel;
    channel.onmessage = async (event: MessageEvent<{ type: string; updatedAt: string }>) => {
      if (event.data?.type !== "state-updated") return;
      const stored = await readState();
      setState((current) => {
        if (!stored || current?.updatedAt === stored.updatedAt) return current;
        return normalizeState(stored);
      });
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const setOffline = () => {
      setIsOnline(false);
      setState((current) => (current ? { ...current, sync: { ...current.sync, status: "offline" } } : current));
    };
    const setOnline = () => {
      setIsOnline(true);
      setState((current) => (current ? { ...current, sync: { ...current.sync, status: "pending" } } : current));
    };

    window.addEventListener("offline", setOffline);
    window.addEventListener("online", setOnline);
    return () => {
      window.removeEventListener("offline", setOffline);
      window.removeEventListener("online", setOnline);
    };
  }, []);

  React.useEffect(() => {
    const query = state?.ui.friendQuery.trim() ?? "";
    if (!canUseCloud || query.length < 2) {
      return;
    }

    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    searchProfiles(supabase, query, userId)
      .then((results) => {
        if (!cancelled) setRemoteDirectory(results);
      })
      .catch(() => {
        if (!cancelled) setRemoteDirectory([]);
      });

    return () => {
      cancelled = true;
    };
  }, [canUseCloud, state?.ui.friendQuery, userId]);

  const runSync = React.useCallback(
    async (snapshot: AppState) => {
      if (!isOnline) {
        const offline = { ...snapshot, sync: { ...snapshot.sync, status: "offline" as const } };
        setState(offline);
        await writeState(offline);
        return;
      }

      const syncing = { ...snapshot, sync: { ...snapshot.sync, status: "syncing" as const, error: "" } };
      setState(syncing);

      try {
        const now = new Date().toISOString();
        const remote = canUseCloud ? "Supabase" : await mirrorToCloud(syncing);
        const synced: AppState = {
          ...syncing,
          updatedAt: now,
          sync: {
            ...syncing.sync,
            remote,
            status: "synced",
            pendingChanges: 0,
            lastSyncedAt: now
          }
        };
        setState(synced);
        await writeState(synced);
        channelRef.current?.postMessage({ type: "state-updated", updatedAt: synced.updatedAt });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Sync failed";
        const failed: AppState = {
          ...syncing,
          sync: {
            ...syncing.sync,
            status: "error",
            error: errorMessage
          }
        };
        setState(failed);
        await writeState(failed);
        captureClientEvent("sync_failed", {
          user_id: userId,
          cloud_mode: canUseCloud,
          remote: snapshot.sync.remote,
          pending_changes: snapshot.sync.pendingChanges,
          error_message: errorMessage
        });
        captureClientException(error, {
          feature: "sync",
          remote: snapshot.sync.remote
        });
        showToast("Sync failed");
      }
    },
    [canUseCloud, isOnline, showToast, userId]
  );

  const persist = React.useCallback(
    async (updater: (current: AppState) => AppState, message?: string) => {
      if (!state) return;

      const now = new Date().toISOString();
      const next = normalizeState(updater(state));
      const withMeta: AppState = {
        ...next,
        updatedAt: now,
        sync: canUseCloud
          ? {
              ...next.sync,
              remote: "Supabase",
              status: "synced",
              pendingChanges: 0,
              error: "",
              lastLocalSaveAt: now,
              lastSyncedAt: now
            }
          : {
              ...next.sync,
              pendingChanges: next.sync.pendingChanges + 1,
              status: isOnline ? "pending" : "offline",
              lastLocalSaveAt: now
            }
      };

      setState(withMeta);
      await writeState(withMeta);
      channelRef.current?.postMessage({ type: "state-updated", updatedAt: withMeta.updatedAt });
      if (message) showToast(message);

      if (!canUseCloud) {
        if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = window.setTimeout(() => runSync(withMeta), 500);
      }
    },
    [canUseCloud, isOnline, runSync, showToast, state]
  );

  const visibleEntries = React.useMemo(() => (state ? getVisibleMapEntries(state, userId) : []), [state, userId]);
  const selectedEntry = React.useMemo(
    () => visibleEntries.find((entry) => entry.id === selectedEntryId) ?? null,
    [selectedEntryId, visibleEntries]
  );
  const listedEntries = React.useMemo(
    () => filterAndSortEntries(visibleEntries, placeQuery, placeFilter, placeSort, userId),
    [placeFilter, placeQuery, placeSort, userId, visibleEntries]
  );
  const locationMatches = React.useMemo(() => searchLocations(locationQuery), [locationQuery]);

  if (supabaseConfigured && !initialUser && !demoMode) {
    return <LoginScreen onUseLocal={() => setDemoMode(true)} />;
  }

  if (!state) {
    return <LoadingShell />;
  }

  async function saveEntry(entryDraft: DraftEntry, files: FileList | null) {
    if (!state) return;

    const existing = entryDraft.id ? state.entries.find((entry) => entry.id === entryDraft.id) : undefined;
    if (existing && existing.ownerId !== userId) {
      showToast("Shared entries are read-only unless you own them");
      return;
    }

    const now = new Date().toISOString();
    const entryId = existing?.id ?? (canUseCloud ? crypto.randomUUID() : createId("entry"));
    const localPhotos = canUseCloud ? [] : await filesToPhotos(files);
    let entry: DiaryEntry = {
      id: entryId,
      ownerId: existing?.ownerId ?? userId,
      title: entryDraft.title || entryDraft.placeName,
      placeName: entryDraft.placeName,
      note: entryDraft.note,
      lat: entryDraft.lat,
      lng: entryDraft.lng,
      icon: entryDraft.icon,
      color: entryDraft.color,
      visibility: entryDraft.visibility,
      mates: entryDraft.mates,
      photos: [...(existing?.photos ?? []), ...localPhotos],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    try {
      if (canUseCloud) {
        const supabase = createSupabaseBrowserClient();
        const cloudEntry = { ...entry, mates: entry.mates.filter(isUuid) };
        const uploadedPhotos = await saveEntryToCloud(supabase, userId, cloudEntry, files);
        entry = { ...cloudEntry, photos: [...(existing?.photos ?? []), ...uploadedPhotos] };
      }

      await persist((current) => ({
        ...current,
        entries: existing
          ? current.entries.map((item) => (item.id === existing.id ? entry : item))
          : [...current.entries, entry]
      }), entryDraft.id ? "Entry updated" : "Place saved");
      captureAppEvent("place_saved", {
        action: existing ? "updated" : "created",
        visibility: entry.visibility,
        mate_count: entry.mates.length,
        photo_count: entry.photos.length,
        uploaded_photo_count: Array.from(files ?? []).filter((file) => file.type.startsWith("image/")).length,
        has_note: Boolean(entry.note.trim())
      });
      setSelectedEntryId(entry.id);
      setDraftLocation(null);
      setActiveView("map");
    } catch (error) {
      captureClientException(error, {
        feature: "place_save",
        action: existing ? "updated" : "created"
      });
      showToast(error instanceof Error ? error.message : "Could not save place");
    }
  }

  async function deleteEntry(entryId: string) {
    if (!state) return;
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) return;

    try {
      if (canUseCloud && entry.ownerId === userId) {
        const supabase = createSupabaseBrowserClient();
        await deleteEntryFromCloud(supabase, entryId);
      }
      await persist(
        (current) => ({
          ...current,
          entries: current.entries.filter((item) => item.id !== entryId)
        }),
        "Entry deleted"
      );
      captureAppEvent("place_deleted", {
        visibility: entry.visibility,
        mate_count: entry.mates.length,
        photo_count: entry.photos.length
      });
      setSelectedEntryId(null);
      setDraftLocation(null);
    } catch (error) {
      captureClientException(error, {
        feature: "place_delete",
        entry_owner: entry.ownerId === userId ? "self" : "other"
      });
      showToast(error instanceof Error ? error.message : "Could not delete entry");
    }
  }

  async function removePhoto(entryId: string, photoId: string) {
    if (!state) return;
    const entry = state.entries.find((item) => item.id === entryId);
    const photo = entry?.photos.find((item) => item.id === photoId);
    if (!entry || !photo) return;

    try {
      if (canUseCloud && photo.storagePath) {
        const supabase = createSupabaseBrowserClient();
        await deletePhotoFromCloud(supabase, photo);
      }
      await persist(
        (current) => ({
          ...current,
          entries: current.entries.map((item) =>
            item.id === entryId
              ? {
                  ...item,
                  photos: item.photos.filter((entryPhoto) => entryPhoto.id !== photoId),
                  updatedAt: new Date().toISOString()
                }
              : item
          )
        }),
        "Photo removed"
      );
      captureAppEvent("photo_removed", {
        had_storage_path: Boolean(photo.storagePath),
        remaining_photo_count: Math.max(0, entry.photos.length - 1)
      });
    } catch (error) {
      captureClientException(error, {
        feature: "photo_remove",
        had_storage_path: Boolean(photo.storagePath)
      });
      showToast(error instanceof Error ? error.message : "Could not remove photo");
    }
  }

  async function addFriend(friend: Friend) {
    try {
      if (canUseCloud && isUuid(friend.id)) {
        const supabase = createSupabaseBrowserClient();
        await addFriendToCloud(supabase, userId, friend.id);
      }
      await persist(
        (current) => ({
          ...current,
          friends: current.friends.some((item) => item.id === friend.id)
            ? current.friends
            : [...current.friends, { ...friend, following: true, followsYou: false, feedVisible: true }]
        }),
        "Friend added"
      );
      captureAppEvent("friend_added", {
        source: canUseCloud && isUuid(friend.id) ? "cloud_directory" : "local_directory",
        existing_friend_count: state?.friends.length ?? 0
      });
    } catch (error) {
      captureClientException(error, {
        feature: "friend_add",
        source: canUseCloud && isUuid(friend.id) ? "cloud_directory" : "local_directory"
      });
      showToast(error instanceof Error ? error.message : "Could not add friend");
    }
  }

  async function saveProfile(profile: Partial<AppState["profile"]>) {
    if (!state) return;
    try {
      const nextProfile = { ...state.profile, ...profile, id: userId };
      if (canUseCloud) {
        const supabase = createSupabaseBrowserClient();
        await saveProfileToCloud(supabase, nextProfile);
      }
      await persist(
        (current) => ({
          ...current,
          profile: {
            ...current.profile,
            ...profile,
            id: userId
          }
        }),
        "Account saved"
      );
      captureAppEvent("profile_updated", {
        feed_visible: nextProfile.feedVisible,
        private_by_default: nextProfile.privateByDefault,
        has_email: Boolean(nextProfile.email)
      });
    } catch (error) {
      captureClientException(error, {
        feature: "profile_save"
      });
      showToast(error instanceof Error ? error.message : "Could not save account");
    }
  }

  async function saveTheme(themePatch: Partial<ThemeSettings>) {
    if (!state) return;

    const theme: ThemeSettings = {
      ...state.settings.theme,
      ...themePatch
    };

    try {
      if (canUseCloud) {
        const supabase = createSupabaseBrowserClient();
        await saveThemeToCloud(supabase, userId, theme);
      }
      await persist((current) => ({
        ...current,
        settings: {
          ...current.settings,
          theme
        }
      }));
      captureAppEvent("theme_updated", {
        changed_keys: Object.keys(themePatch),
        map_style: theme.mapStyle,
        font_family: theme.fontFamily
      });
    } catch (error) {
      captureClientException(error, {
        feature: "theme_save",
        changed_keys: Object.keys(themePatch)
      });
      showToast(error instanceof Error ? error.message : "Could not save style");
    }
  }

  function openLocationDraft(location: DraftLocation, source: "map_click" | "search") {
    captureAppEvent("place_draft_started", {
      source,
      place_source: source === "search" ? "offline_city_atlas" : "map_click",
      has_existing_entries: visibleEntries.length > 0
    });
    setDraftLocation(location);
    setSelectedEntryId(null);
    setActiveView("map");
    setLocationQuery("");
  }

  const friendSearchQuery = state.ui.friendQuery.trim();
  const friendSuggestions = canUseCloud
    ? friendSearchQuery.length >= 2
      ? remoteDirectory
      : []
    : directory
        .filter((person) => {
          const query = state.ui.friendQuery.toLowerCase();
          const haystack = `${person.displayName} ${person.username} ${person.email}`.toLowerCase();
          return !query || haystack.includes(query);
        })
        .map(directoryUserToFriend);

  const handleViewChange = (view: ViewId) => {
    setActiveView(view);
    if (view !== "map") {
      setDraftLocation(null);
      setSelectedEntryId(null);
    }
  };

  const handleSelectEntry = (entryId: string) => {
    setSelectedEntryId(entryId);
    setDraftLocation(null);
    setActiveView("map");
  };

  const handleClearSelection = () => {
    setSelectedEntryId(null);
    setDraftLocation(null);
  };

  const handleAddPlaceHint = () => {
    setActiveView("map");
    setSelectedEntryId(null);
    setDraftLocation(null);
    showToast("Tap anywhere on the map to add a place");
  };

  const handleSync = () => {
    captureAppEvent("sync_requested", {
      source: "menu",
      pending_changes: state.sync.pendingChanges,
      sync_status: state.sync.status
    });
    void runSync(state);
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  };

  const handleFriendQueryChange = (query: string) =>
    setState((current) => (current ? { ...current, ui: { ...current.ui, friendQuery: query } } : current));

  const handleToggleFollow = (friendId: string) =>
    void persist(
      (current) => ({
        ...current,
        friends: current.friends.map((friend) =>
          friend.id === friendId ? { ...friend, following: !friend.following } : friend
        )
      }),
      "Friend updated"
    );

  const handleToggleFeed = (friendId: string, visible: boolean) =>
    void persist(
      (current) => ({
        ...current,
        friends: current.friends.map((friend) =>
          friend.id === friendId ? { ...friend, feedVisible: visible } : friend
        )
      }),
      "Feed preference saved"
    );

  const handleExport = () => {
    captureAppEvent("data_exported", {
      entry_count: state.entries.length,
      friend_count: state.friends.length,
      photo_count: state.entries.reduce((total, entry) => total + entry.photos.length, 0)
    });
    exportData(state);
  };

  const handleImport = async (file: File) => {
    const imported = normalizeState(JSON.parse(await file.text()) as Partial<AppState>);
    setState(imported);
    await writeState(imported);
    captureAppEvent("data_imported", {
      file_size: file.size,
      entry_count: imported.entries.length,
      friend_count: imported.friends.length,
      photo_count: imported.entries.reduce((total, entry) => total + entry.photos.length, 0)
    });
    showToast("Data imported");
  };

  const syncStatus = isOnline ? state.sync.status : "offline";
  const feedEntries = getFeedEntries(state, userId);

  return (
    <div
      className="flex h-[100dvh] overflow-hidden bg-[var(--canvas)] text-[var(--ink)]"
      style={themeToCssVars(state.settings.theme)}
    >
      {!isMobile ? (
        <SideNav
          activeView={activeView}
          user={state.profile}
          isAuthenticated={isAuthenticated}
          isLocalMode={!canUseCloud}
          installable={Boolean(installPrompt)}
          syncStatus={syncStatus}
          onInstall={handleInstall}
          onSync={handleSync}
          onViewChange={handleViewChange}
        />
      ) : null}

      <main className="relative min-w-0 flex-1 overflow-hidden">
        <DiaryLeafletMap
          entries={visibleEntries}
          friends={state.friends}
          currentUserId={userId}
          selectedEntryId={selectedEntryId}
          mapStyle={state.settings.theme.mapStyle}
          className="fullscreen-map absolute inset-0"
          onPickLocation={(location) => {
            openLocationDraft(location, "map_click");
          }}
          onSelectEntry={(entryId) => {
            setSelectedEntryId(entryId);
            setDraftLocation(null);
            setActiveView("map");
          }}
        />

        {isMobile ? (
          <MobileShell
            state={state}
            userId={userId}
            activeView={activeView}
            selectedEntry={selectedEntry}
            draftLocation={draftLocation}
            listedEntries={listedEntries}
            visibleEntries={visibleEntries}
            feedEntries={feedEntries}
            friendSuggestions={friendSuggestions}
            isAuthenticated={isAuthenticated}
            isLocalMode={!canUseCloud}
            isCloudMode={canUseCloud}
            supabaseConfigured={supabaseConfigured}
            syncStatus={syncStatus}
            installable={Boolean(installPrompt)}
            placeQuery={placeQuery}
            placeSort={placeSort}
            placeFilter={placeFilter}
            locationQuery={locationQuery}
            locationMatches={locationMatches}
            onPlaceQueryChange={setPlaceQuery}
            onPlaceSortChange={setPlaceSort}
            onPlaceFilterChange={setPlaceFilter}
            onLocationQueryChange={setLocationQuery}
            onChooseLocation={(location) => openLocationDraft(location, "search")}
            onViewChange={handleViewChange}
            onSelectEntry={handleSelectEntry}
            onClearSelection={handleClearSelection}
            onSaveEntry={saveEntry}
            onDeleteEntry={(id) => void deleteEntry(id)}
            onRemovePhoto={(entryId, photoId) => void removePhoto(entryId, photoId)}
            onAddPlaceHint={handleAddPlaceHint}
            onFriendQueryChange={handleFriendQueryChange}
            onAddFriend={(friend) => void addFriend(friend)}
            onToggleFollow={handleToggleFollow}
            onToggleFeed={handleToggleFeed}
            onSync={handleSync}
            onInstall={handleInstall}
            onProfileSave={(profile) => void saveProfile(profile)}
            onThemeChange={(theme) => void saveTheme(theme)}
            onExport={handleExport}
            onImport={handleImport}
          />
        ) : (
          <>
            <DesktopTopBar
              locationQuery={locationQuery}
              locationMatches={locationMatches}
              onLocationQueryChange={setLocationQuery}
              onChooseLocation={(location) => openLocationDraft(location, "search")}
            />

            {activeView === "map" && (selectedEntry || draftLocation) ? (
              <EditorPanel>
                <EntryEditor
                  state={state}
                  currentUserId={userId}
                  selectedEntry={selectedEntry}
                  draftLocation={draftLocation}
                  onCancel={handleClearSelection}
                  onDelete={(entryId) => void deleteEntry(entryId)}
                  onRemovePhoto={(entryId, photoId) => void removePhoto(entryId, photoId)}
                  onSave={saveEntry}
                />
              </EditorPanel>
            ) : null}

            {activeView === "scrapbook" ? (
              <PlaceListPanel
                entries={listedEntries}
                totalEntries={visibleEntries.length}
                query={placeQuery}
                sort={placeSort}
                filter={placeFilter}
                onQueryChange={setPlaceQuery}
                onSortChange={setPlaceSort}
                onFilterChange={setPlaceFilter}
                onAddPlace={handleAddPlaceHint}
                onOpenEntry={handleSelectEntry}
              />
            ) : null}

            {activeView === "feed" ? (
              <FeedPanel state={state} entries={feedEntries} currentUserId={userId} onOpenEntry={handleSelectEntry} />
            ) : null}

            {activeView === "friends" ? (
              <FriendsPanel
                state={state}
                suggestions={friendSuggestions}
                onQueryChange={handleFriendQueryChange}
                onAddFriend={(friend) => void addFriend(friend)}
                onToggleFollow={handleToggleFollow}
                onToggleFeed={handleToggleFeed}
              />
            ) : null}

            {activeView === "settings" ? (
              <SettingsPanel
                state={state}
                isCloudMode={canUseCloud}
                supabaseConfigured={supabaseConfigured}
                onProfileSave={(profile) => void saveProfile(profile)}
                onThemeChange={(theme) => void saveTheme(theme)}
                onSync={handleSync}
                onExport={handleExport}
                onImport={handleImport}
              />
            ) : null}
          </>
        )}
      </main>

      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[900] grid max-w-[calc(100vw-32px)] -translate-x-1/2 gap-2">
        {toast ? (
          <div className="rounded-[50px] bg-[var(--inverse-canvas)] px-4 py-2 text-[var(--inverse-ink)] shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LoginScreen({ onUseLocal }: { onUseLocal: () => void }) {
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    setError("");
    captureClientEvent("oauth_login_started", {
      provider: "google"
    });
    const supabase = createSupabaseBrowserClient();
    const { error: loginError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`
      }
    });
    if (loginError) {
      captureClientException(loginError, {
        feature: "oauth_login",
        provider: "google"
      });
      setError(loginError.message);
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[var(--surface-soft)] px-4">
      <section className="grid w-full max-w-[760px] gap-6 rounded-[24px] border border-[var(--hairline)] bg-[var(--canvas)] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.08)] max-md:p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-[var(--primary)] font-bold text-[var(--on-primary)]">
            MD
          </span>
          <div>
            <p className="font-mono text-xs uppercase">Map Diary</p>
            <h1 className="text-4xl font-[340] leading-none max-md:text-3xl">Private places, synced everywhere</h1>
          </div>
        </div>
        <p className="max-w-[58ch] text-lg leading-snug">
          Sign in with Google to keep entries, friends, photos, and shared trips in Supabase. You can also continue in
          local mode for this browser.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void signInWithGoogle()} disabled={loading}>
            <Cloud className="size-4" />
            {loading ? "Opening Google" : "Continue with Google"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              captureClientEvent("local_mode_started", {
                source: "login_screen"
              });
              resetPostHogUser();
              onUseLocal();
            }}
          >
            Use local mode
          </Button>
        </div>
        {error ? <p className="text-sm text-[var(--semantic-danger)]">{error}</p> : null}
      </section>
    </main>
  );
}

function SideNav({
  activeView,
  user,
  isAuthenticated,
  isLocalMode,
  installable,
  syncStatus,
  onInstall,
  onSync,
  onViewChange
}: {
  activeView: ViewId;
  user: AppState["profile"];
  isAuthenticated: boolean;
  isLocalMode: boolean;
  installable: boolean;
  syncStatus: AppState["sync"]["status"];
  onInstall: () => void;
  onSync: () => void;
  onViewChange: (view: ViewId) => void;
}) {
  const syncLabel = syncStatusLabel(syncStatus, isLocalMode);

  return (
    <aside className="z-[700] flex w-[268px] shrink-0 flex-col border-r border-[var(--hairline)] bg-[var(--canvas)] p-4 max-md:hidden">
      <button className="mb-8 flex items-center gap-3 text-left" onClick={() => onViewChange("map")} aria-label="Map Diary home">
        <span className="grid size-11 place-items-center rounded-full bg-[var(--primary)] text-sm font-bold text-[var(--on-primary)]">
          MD
        </span>
        <span>
          <strong className="block text-xl leading-tight">Map Diary</strong>
          <span className="text-sm text-black/60">@{user.username}</span>
        </span>
      </button>

      <nav className="grid gap-1">
        {views.map((view) => {
          const Icon = view.icon;
          return (
            <Button
              key={view.id}
              variant={activeView === view.id ? "primary" : "ghost"}
              className="justify-start"
              onClick={() => onViewChange(view.id)}
            >
              <Icon className="size-4" />
              {view.label}
            </Button>
          );
        })}
      </nav>

      <div className="mt-auto grid gap-2 border-t border-[var(--hairline)] pt-4">
        <Button variant="secondary" className="justify-start" onClick={onSync}>
          {syncStatus === "offline" ? <WifiOff className="size-4" /> : <Cloud className="size-4" />}
          {syncLabel}
        </Button>
        {installable ? (
          <Button variant="secondary" className="justify-start" onClick={onInstall}>
            <Download className="size-4" />
            Install app
          </Button>
        ) : null}
        {isAuthenticated ? (
          <form action="/auth/logout" method="post" onSubmit={resetPostHogUser}>
            <Button type="submit" variant="secondary" className="w-full justify-start">
              <LogOut className="size-4" />
              Log out
            </Button>
          </form>
        ) : (
          <Badge>Local browser mode</Badge>
        )}
      </div>
    </aside>
  );
}

function EditorPanel({ children }: { children: React.ReactNode }) {
  return (
    <aside className="absolute bottom-5 right-5 top-5 z-[650] w-[430px] overflow-y-auto rounded-[24px] border border-[var(--hairline)] bg-[var(--canvas)] shadow-[0_20px_70px_rgba(0,0,0,0.14)] max-md:inset-x-3 max-md:bottom-24 max-md:top-48 max-md:w-auto">
      {children}
    </aside>
  );
}

function OverlayPanel({
  eyebrow,
  title,
  children
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="absolute bottom-5 right-5 top-5 z-[650] w-[520px] overflow-y-auto rounded-[24px] border border-[var(--hairline)] bg-[var(--canvas)] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.14)] max-md:inset-x-3 max-md:bottom-24 max-md:top-32 max-md:w-auto">
      <div className="mb-5">
        <p className="mb-2 font-mono text-xs uppercase">{eyebrow}</p>
        <h2 className="text-4xl font-[340] leading-none max-md:text-3xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isMobile;
}

interface MobileShellProps {
  state: AppState;
  userId: string;
  activeView: ViewId;
  selectedEntry: DiaryEntry | null;
  draftLocation: DraftLocation | null;
  listedEntries: DiaryEntry[];
  visibleEntries: DiaryEntry[];
  feedEntries: DiaryEntry[];
  friendSuggestions: Friend[];
  isAuthenticated: boolean;
  isLocalMode: boolean;
  isCloudMode: boolean;
  supabaseConfigured: boolean;
  syncStatus: AppState["sync"]["status"];
  installable: boolean;
  placeQuery: string;
  placeSort: PlaceSort;
  placeFilter: PlaceFilter;
  locationQuery: string;
  locationMatches: DraftLocation[];
  onPlaceQueryChange: (query: string) => void;
  onPlaceSortChange: (sort: PlaceSort) => void;
  onPlaceFilterChange: (filter: PlaceFilter) => void;
  onLocationQueryChange: (query: string) => void;
  onChooseLocation: (location: DraftLocation) => void;
  onViewChange: (view: ViewId) => void;
  onSelectEntry: (id: string) => void;
  onClearSelection: () => void;
  onSaveEntry: (entry: DraftEntry, files: FileList | null) => Promise<void>;
  onDeleteEntry: (entryId: string) => void;
  onRemovePhoto: (entryId: string, photoId: string) => void;
  onAddPlaceHint: () => void;
  onFriendQueryChange: (query: string) => void;
  onAddFriend: (friend: Friend) => void;
  onToggleFollow: (userId: string) => void;
  onToggleFeed: (userId: string, visible: boolean) => void;
  onSync: () => void;
  onInstall: () => void;
  onProfileSave: (profile: Partial<AppState["profile"]>) => void;
  onThemeChange: (theme: Partial<ThemeSettings>) => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
}

function MobileShell(props: MobileShellProps) {
  const {
    state,
    userId,
    activeView,
    selectedEntry,
    draftLocation,
    listedEntries,
    visibleEntries,
    feedEntries,
    friendSuggestions,
    isAuthenticated,
    isLocalMode,
    isCloudMode,
    supabaseConfigured,
    syncStatus,
    installable,
    placeQuery,
    placeSort,
    placeFilter,
    locationQuery,
    locationMatches,
    onPlaceQueryChange,
    onPlaceSortChange,
    onPlaceFilterChange,
    onLocationQueryChange,
    onChooseLocation,
    onViewChange,
    onSelectEntry,
    onClearSelection,
    onSaveEntry,
    onDeleteEntry,
    onRemovePhoto,
    onAddPlaceHint,
    onFriendQueryChange,
    onAddFriend,
    onToggleFollow,
    onToggleFeed,
    onSync,
    onInstall,
    onProfileSave,
    onThemeChange,
    onExport,
    onImport
  } = props;

  const snapPoints = React.useMemo(() => ["92px", 0.5, 0.95] as Array<number | string>, []);
  const [menuOpen, setMenuOpen] = React.useState(false);

  const onMap = activeView === "map";
  const hasFocus = Boolean(selectedEntry || draftLocation);

  const targetSnap = !onMap ? snapPoints[2] : hasFocus ? snapPoints[1] : snapPoints[0];
  const drawerKey = `${onMap}-${hasFocus}`;
  const [snap, setSnap] = React.useState<number | string | null>(targetSnap);
  const [lastKey, setLastKey] = React.useState(drawerKey);
  if (lastKey !== drawerKey) {
    setLastKey(drawerKey);
    setSnap(targetSnap);
  }

  const drawerTitle = !onMap
    ? views.find((view) => view.id === activeView)?.label ?? "Map Diary"
    : selectedEntry
      ? selectedEntry.title || selectedEntry.placeName
      : draftLocation
        ? "New place"
        : `Your places · ${visibleEntries.length}`;

  return (
    <>
      <MobileTopBar
        locationQuery={locationQuery}
        locationMatches={locationMatches}
        onLocationQueryChange={onLocationQueryChange}
        onChooseLocation={onChooseLocation}
        onOpenMenu={() => setMenuOpen(true)}
        userName={state.profile.displayName}
        syncStatus={syncStatus}
        isLocalMode={isLocalMode}
      />

      <Drawer
        open
        modal={false}
        dismissible={false}
        snapPoints={snapPoints}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
      >
        <DrawerPortal>
          <DrawerContent
            withHandle
            className="h-[95dvh] outline-none"
            aria-describedby={undefined}
          >
            <DrawerTitle className="sr-only">{drawerTitle}</DrawerTitle>
            <MobileDrawerBody
              state={state}
              userId={userId}
              activeView={activeView}
              selectedEntry={selectedEntry}
              draftLocation={draftLocation}
              listedEntries={listedEntries}
              visibleEntries={visibleEntries}
              feedEntries={feedEntries}
              friendSuggestions={friendSuggestions}
              isCloudMode={isCloudMode}
              supabaseConfigured={supabaseConfigured}
              placeQuery={placeQuery}
              placeSort={placeSort}
              placeFilter={placeFilter}
              onPlaceQueryChange={onPlaceQueryChange}
              onPlaceSortChange={onPlaceSortChange}
              onPlaceFilterChange={onPlaceFilterChange}
              onSelectEntry={onSelectEntry}
              onClearSelection={onClearSelection}
              onSaveEntry={onSaveEntry}
              onDeleteEntry={onDeleteEntry}
              onRemovePhoto={onRemovePhoto}
              onAddPlaceHint={onAddPlaceHint}
              onFriendQueryChange={onFriendQueryChange}
              onAddFriend={onAddFriend}
              onToggleFollow={onToggleFollow}
              onToggleFeed={onToggleFeed}
              onSync={onSync}
              onProfileSave={onProfileSave}
              onThemeChange={onThemeChange}
              onExport={onExport}
              onImport={onImport}
              onExpand={() => setSnap(snapPoints[2])}
              onPeek={() => setSnap(snapPoints[0])}
            />
          </DrawerContent>
        </DrawerPortal>
      </Drawer>

      <Drawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
        direction="right"
      >
        <DrawerPortal>
          <DrawerOverlay />
          <DrawerContent withHandle={false} direction="right" className="p-5">
            <DrawerTitle className="sr-only">Map Diary menu</DrawerTitle>
            <MobileMenu
              user={state.profile}
              activeView={activeView}
              syncStatus={syncStatus}
              isAuthenticated={isAuthenticated}
              isLocalMode={isLocalMode}
              installable={installable}
              onSync={onSync}
              onInstall={onInstall}
              onViewChange={(view) => {
                onViewChange(view);
                setMenuOpen(false);
              }}
            />
          </DrawerContent>
        </DrawerPortal>
      </Drawer>
    </>
  );
}

function DesktopTopBar({
  locationQuery,
  locationMatches,
  onLocationQueryChange,
  onChooseLocation
}: {
  locationQuery: string;
  locationMatches: DraftLocation[];
  onLocationQueryChange: (query: string) => void;
  onChooseLocation: (location: DraftLocation) => void;
}) {
  const showSuggestions = locationQuery.trim().length >= 2;
  return (
    <div className="pointer-events-none absolute left-1/2 top-5 z-[700] grid w-[min(520px,calc(100vw-260px))] -translate-x-1/2 gap-2">
      <form
        className="pointer-events-auto flex h-12 items-center gap-2 rounded-[50px] border border-[var(--hairline)] bg-[var(--canvas)] px-4 shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
        onSubmit={(event) => {
          event.preventDefault();
          const first = locationMatches[0];
          if (first) onChooseLocation(first);
        }}
      >
        <Search className="size-4 shrink-0 text-black/55" aria-hidden />
        <input
          aria-label="Search a place"
          className="min-h-9 w-full bg-transparent text-base font-[330] leading-snug placeholder:text-black/45 focus:outline-none"
          value={locationQuery}
          placeholder="Search a place"
          onChange={(event) => onLocationQueryChange(event.target.value)}
        />
        {locationQuery ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onLocationQueryChange("")}
            className="grid size-7 shrink-0 place-items-center rounded-full text-black/55 transition hover:bg-[var(--surface-soft)] active:scale-[0.96]"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </form>

      {showSuggestions ? (
        <div className="pointer-events-auto overflow-hidden rounded-[24px] border border-[var(--hairline)] bg-[var(--canvas)] shadow-[0_8px_28px_rgba(0,0,0,0.08)]">
          {locationMatches.length ? (
            locationMatches.map((location) => (
              <button
                key={`${location.placeName}-${location.lat}-${location.lng}`}
                type="button"
                className="flex w-full items-center justify-between gap-3 border-b border-[var(--hairline-soft)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--surface-soft)]"
                onClick={() => onChooseLocation(location)}
              >
                <span className="font-semibold">{location.placeName}</span>
                <span className="font-mono text-xs text-black/60">{formatLatLng(location.lat, location.lng)}</span>
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm">No offline match. Click the map to place it manually.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MobileTopBar({
  locationQuery,
  locationMatches,
  onLocationQueryChange,
  onChooseLocation,
  onOpenMenu,
  userName,
  syncStatus,
  isLocalMode
}: {
  locationQuery: string;
  locationMatches: DraftLocation[];
  onLocationQueryChange: (query: string) => void;
  onChooseLocation: (location: DraftLocation) => void;
  onOpenMenu: () => void;
  userName: string;
  syncStatus: AppState["sync"]["status"];
  isLocalMode: boolean;
}) {
  const showSuggestions = locationQuery.trim().length >= 2;

  return (
    <div
      className="pointer-events-none absolute inset-x-3 top-3 z-[700] grid gap-2 md:left-1/2 md:right-auto md:top-5 md:w-[min(560px,calc(100vw-260px))] md:-translate-x-1/2"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <form
        className="pointer-events-auto flex h-12 items-center gap-2 rounded-[50px] border border-[var(--hairline)] bg-[var(--canvas)] pl-1.5 pr-3 shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
        onSubmit={(event) => {
          event.preventDefault();
          const first = locationMatches[0];
          if (first) onChooseLocation(first);
        }}
      >
        <button
          type="button"
          aria-label="Open menu"
          onClick={onOpenMenu}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--surface-soft)] text-xs font-[540] uppercase tracking-wide text-[var(--ink)] transition active:scale-[0.96]"
          title={`${userName} · ${syncStatusLabel(syncStatus, isLocalMode)}`}
        >
          {initials(userName) || "MD"}
        </button>
        <input
          aria-label="Search a place"
          className="min-h-9 w-full bg-transparent text-base font-[330] leading-snug placeholder:text-black/45 focus:outline-none"
          value={locationQuery}
          placeholder="Search a place"
          onChange={(event) => onLocationQueryChange(event.target.value)}
        />
        {locationQuery ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onLocationQueryChange("")}
            className="grid size-7 shrink-0 place-items-center rounded-full text-black/55 transition hover:bg-[var(--surface-soft)] active:scale-[0.96]"
          >
            <X className="size-4" />
          </button>
        ) : (
          <Search className="size-4 shrink-0 text-black/55" aria-hidden />
        )}
      </form>

      {showSuggestions ? (
        <div className="pointer-events-auto overflow-hidden rounded-[24px] border border-[var(--hairline)] bg-[var(--canvas)] shadow-[0_8px_28px_rgba(0,0,0,0.08)]">
          {locationMatches.length ? (
            locationMatches.map((location) => (
              <button
                key={`${location.placeName}-${location.lat}-${location.lng}`}
                type="button"
                className="flex w-full items-center justify-between gap-3 border-b border-[var(--hairline-soft)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--surface-soft)]"
                onClick={() => onChooseLocation(location)}
              >
                <span className="font-semibold">{location.placeName}</span>
                <span className="font-mono text-xs text-black/60">{formatLatLng(location.lat, location.lng)}</span>
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm">No offline match. Tap the map to place it manually.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MobileMenu({
  user,
  activeView,
  syncStatus,
  isAuthenticated,
  isLocalMode,
  installable,
  onSync,
  onInstall,
  onViewChange
}: {
  user: AppState["profile"];
  activeView: ViewId;
  syncStatus: AppState["sync"]["status"];
  isAuthenticated: boolean;
  isLocalMode: boolean;
  installable: boolean;
  onSync: () => void;
  onInstall: () => void;
  onViewChange: (view: ViewId) => void;
}) {
  return (
    <div className="grid h-full content-start gap-4">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-[var(--primary)] text-sm font-bold text-[var(--on-primary)]">
          {initials(user.displayName) || "MD"}
        </span>
        <div>
          <strong className="block text-lg leading-tight">{user.displayName}</strong>
          <span className="text-sm text-black/60">@{user.username}</span>
        </div>
      </div>

      <nav className="grid gap-1">
        {views.map((view) => {
          const Icon = view.icon;
          return (
            <Button
              key={view.id}
              variant={activeView === view.id ? "primary" : "ghost"}
              className="justify-start"
              onClick={() => onViewChange(view.id)}
            >
              <Icon className="size-4" />
              {view.label}
            </Button>
          );
        })}
      </nav>

      <div className="mt-auto grid gap-2 border-t border-[var(--hairline)] pt-4">
        <Button variant="secondary" className="justify-start" onClick={onSync}>
          {syncStatus === "offline" ? <WifiOff className="size-4" /> : <Cloud className="size-4" />}
          {syncStatusLabel(syncStatus, isLocalMode)}
        </Button>
        {installable ? (
          <Button variant="secondary" className="justify-start" onClick={onInstall}>
            <Download className="size-4" />
            Install app
          </Button>
        ) : null}
        {isAuthenticated ? (
          <form action="/auth/logout" method="post" onSubmit={resetPostHogUser}>
            <Button type="submit" variant="secondary" className="w-full justify-start">
              <LogOut className="size-4" />
              Log out
            </Button>
          </form>
        ) : (
          <Badge>Local browser mode</Badge>
        )}
      </div>
    </div>
  );
}

interface MobileDrawerBodyProps {
  state: AppState;
  userId: string;
  activeView: ViewId;
  selectedEntry: DiaryEntry | null;
  draftLocation: DraftLocation | null;
  listedEntries: DiaryEntry[];
  visibleEntries: DiaryEntry[];
  feedEntries: DiaryEntry[];
  friendSuggestions: Friend[];
  isCloudMode: boolean;
  supabaseConfigured: boolean;
  placeQuery: string;
  placeSort: PlaceSort;
  placeFilter: PlaceFilter;
  onPlaceQueryChange: (query: string) => void;
  onPlaceSortChange: (sort: PlaceSort) => void;
  onPlaceFilterChange: (filter: PlaceFilter) => void;
  onSelectEntry: (id: string) => void;
  onClearSelection: () => void;
  onSaveEntry: (entry: DraftEntry, files: FileList | null) => Promise<void>;
  onDeleteEntry: (entryId: string) => void;
  onRemovePhoto: (entryId: string, photoId: string) => void;
  onAddPlaceHint: () => void;
  onFriendQueryChange: (query: string) => void;
  onAddFriend: (friend: Friend) => void;
  onToggleFollow: (userId: string) => void;
  onToggleFeed: (userId: string, visible: boolean) => void;
  onSync: () => void;
  onProfileSave: (profile: Partial<AppState["profile"]>) => void;
  onThemeChange: (theme: Partial<ThemeSettings>) => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  onExpand: () => void;
  onPeek: () => void;
}

function MobileDrawerBody(props: MobileDrawerBodyProps) {
  const {
    state,
    userId,
    activeView,
    selectedEntry,
    draftLocation,
    listedEntries,
    visibleEntries,
    feedEntries,
    friendSuggestions,
    isCloudMode,
    supabaseConfigured,
    placeQuery,
    placeSort,
    placeFilter,
    onPlaceQueryChange,
    onPlaceSortChange,
    onPlaceFilterChange,
    onSelectEntry,
    onClearSelection,
    onSaveEntry,
    onDeleteEntry,
    onRemovePhoto,
    onAddPlaceHint,
    onFriendQueryChange,
    onAddFriend,
    onToggleFollow,
    onToggleFeed,
    onSync,
    onProfileSave,
    onThemeChange,
    onExport,
    onImport,
    onExpand,
    onPeek
  } = props;

  const onMap = activeView === "map";

  if (!onMap) {
    return (
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)]">
        <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-3">
          <div>
            <p className="font-mono text-xs uppercase">{activeView}</p>
            <h2 className="text-3xl font-[340] leading-none">
              {activeView === "scrapbook"
                ? "Saved list"
                : activeView === "feed"
                  ? "Common feed"
                  : activeView === "friends"
                    ? "Mates and feeds"
                    : "Account and sync"}
            </h2>
          </div>
          <Button variant="secondary" size="icon" aria-label="Close" onClick={onPeek}>
            <X className="size-5" />
          </Button>
        </header>
        <div className="overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
          {activeView === "scrapbook" ? (
            <PlacesListBody
              entries={listedEntries}
              totalEntries={visibleEntries.length}
              query={placeQuery}
              sort={placeSort}
              filter={placeFilter}
              onQueryChange={onPlaceQueryChange}
              onSortChange={onPlaceSortChange}
              onFilterChange={onPlaceFilterChange}
              onAddPlace={onAddPlaceHint}
              onOpenEntry={onSelectEntry}
            />
          ) : null}
          {activeView === "feed" ? (
            <FeedBody state={state} entries={feedEntries} currentUserId={userId} onOpenEntry={onSelectEntry} />
          ) : null}
          {activeView === "friends" ? (
            <FriendsBody
              state={state}
              suggestions={friendSuggestions}
              onQueryChange={onFriendQueryChange}
              onAddFriend={onAddFriend}
              onToggleFollow={onToggleFollow}
              onToggleFeed={onToggleFeed}
            />
          ) : null}
          {activeView === "settings" ? (
            <SettingsBody
              state={state}
              isCloudMode={isCloudMode}
              supabaseConfigured={supabaseConfigured}
              onProfileSave={onProfileSave}
              onThemeChange={onThemeChange}
              onSync={onSync}
              onExport={onExport}
              onImport={onImport}
            />
          ) : null}
        </div>
      </div>
    );
  }

  if (selectedEntry || draftLocation) {
    return (
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)]" onPointerDown={onExpand}>
        <div className="overflow-y-auto px-1 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-1">
          <EntryEditor
            state={state}
            currentUserId={userId}
            selectedEntry={selectedEntry}
            draftLocation={draftLocation}
            onCancel={onClearSelection}
            onDelete={onDeleteEntry}
            onRemovePhoto={onRemovePhoto}
            onSave={onSaveEntry}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)]">
      <button
        type="button"
        onClick={onExpand}
        className="flex items-center justify-center gap-2 px-5 pb-2 pt-1 text-center"
        aria-label="Expand your places"
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.6px] text-black/60">Your places</span>
        <span className="font-[340] text-base leading-none">· {visibleEntries.length}</span>
      </button>
      <div className="overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
        <PlacesListBody
          entries={listedEntries}
          totalEntries={visibleEntries.length}
          query={placeQuery}
          sort={placeSort}
          filter={placeFilter}
          onQueryChange={onPlaceQueryChange}
          onSortChange={onPlaceSortChange}
          onFilterChange={onPlaceFilterChange}
          onAddPlace={onAddPlaceHint}
          onOpenEntry={onSelectEntry}
        />
      </div>
    </div>
  );
}

function LoadingShell() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[var(--surface-soft)] px-6">
      <div className="grid w-full max-w-[520px] gap-4">
        <div className="h-11 w-32 rounded-[50px] bg-[var(--primary)]" />
        <div className="h-16 w-2/3 rounded-[8px] bg-white" />
        <div className="h-[360px] rounded-[24px] bg-[var(--block-lime)]" />
      </div>
    </main>
  );
}

function MapLoading() {
  return (
    <div className="grid h-full min-h-[100dvh] place-items-center bg-[var(--surface-soft)]">
      <div className="grid gap-3 text-center">
        <Map className="mx-auto size-6" />
        <p className="font-mono text-xs uppercase">Loading map</p>
      </div>
    </div>
  );
}

function EntryEditor({
  state,
  currentUserId,
  selectedEntry,
  draftLocation,
  onSave,
  onDelete,
  onRemovePhoto,
  onCancel
}: {
  state: AppState;
  currentUserId: string;
  selectedEntry: DiaryEntry | null;
  draftLocation: DraftLocation | null;
  onSave: (entry: DraftEntry, files: FileList | null) => Promise<void>;
  onDelete: (entryId: string) => void;
  onRemovePhoto: (entryId: string, photoId: string) => void;
  onCancel: () => void;
}) {
  const entry = React.useMemo<DraftEntry | null>(() => {
    if (selectedEntry) return selectedEntry;
    if (!draftLocation) return null;

    return {
      title: "",
      placeName: draftLocation.placeName,
      note: "",
      lat: draftLocation.lat,
      lng: draftLocation.lng,
      icon: state.profile.preferredIcon,
      color: "#000000",
      visibility: state.profile.privateByDefault ? "private" : "friends",
      mates: [],
      photos: []
    };
  }, [draftLocation, selectedEntry, state.profile.preferredIcon, state.profile.privateByDefault]);

  if (!entry) {
    return (
      <div className="grid gap-5 p-5">
        <div>
          <p className="mb-2 font-mono text-xs uppercase">New place</p>
          <h2 className="text-3xl font-[340] leading-tight">Click the map</h2>
          <p className="mt-2 text-base leading-snug">
            Drop a pin anywhere, then add the note, photos, visibility, and mates in this panel.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            onCancel();
          }}
        >
          Clear selection
        </Button>
      </div>
    );
  }

  const canDelete = Boolean(selectedEntry && selectedEntry.ownerId === currentUserId);
  const canEdit = !selectedEntry || selectedEntry.ownerId === currentUserId;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="mb-2 font-mono text-xs uppercase">{selectedEntry ? "Memory" : "New spot"}</p>
          <h2 className="text-3xl font-[340] leading-tight">{entry.placeName}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{formatLatLng(entry.lat, entry.lng)}</Badge>
            <Badge>{entry.visibility === "friends" ? "Friends feed" : "Private"}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="icon" aria-label="Close editor" onClick={onCancel}>
            <X className="size-5" />
          </Button>
          {canDelete ? (
            <Button variant="secondary" size="icon" aria-label="Delete entry" onClick={() => selectedEntry && onDelete(selectedEntry.id)}>
              <Trash2 className="size-5" />
            </Button>
          ) : null}
        </div>
      </div>

      <form
        key={entry.id ?? `${entry.lat}-${entry.lng}`}
        className="grid gap-4 px-5 pb-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canEdit) return;
          const form = event.currentTarget;
          const formData = new FormData(form);
          await onSave(
            {
              id: entry.id,
              ownerId: entry.ownerId,
              title: cleanText(formData.get("title")),
              placeName: cleanText(formData.get("placeName")),
              note: cleanText(formData.get("note")),
              lat: entry.lat,
              lng: entry.lng,
              icon: cleanText(formData.get("icon")) as EntryIcon,
              color: cleanText(formData.get("color")) || entry.color,
              visibility: cleanText(formData.get("visibility")) as EntryVisibility,
              mates: formData.getAll("mates").map((mate) => cleanText(mate)),
              photos: entry.photos
            },
            getNamedFileList(form, "photos")
          );
          form.reset();
        }}
      >
        {!canEdit ? <p className="rounded-[8px] bg-[var(--block-cream)] p-3">This is a shared entry. Only the owner can edit it.</p> : null}

        <Field label="Title" htmlFor="entry-title">
          <Input id="entry-title" name="title" defaultValue={entry.title} placeholder="Late train, perfect ramen" disabled={!canEdit} />
        </Field>

        <Field label="Place" htmlFor="entry-place">
          <Input id="entry-place" name="placeName" defaultValue={entry.placeName} required disabled={!canEdit} />
        </Field>

        <fieldset className="grid gap-2" disabled={!canEdit}>
          <legend className="text-sm font-semibold">Marker</legend>
          <div className="flex flex-wrap gap-2">
            {iconOptions.map((option) => {
              const Icon = option.icon;
              return (
                <label
                  key={option.id}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[50px] border border-[var(--hairline)] px-4 py-2 has-[:checked]:border-black has-[:checked]:bg-black has-[:checked]:text-white"
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="icon"
                    value={option.id}
                    defaultChecked={entry.icon === option.id}
                  />
                  <Icon className="size-4" />
                  {option.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="grid gap-2" disabled={!canEdit}>
          <legend className="text-sm font-semibold">Marker color</legend>
          <div className="flex flex-wrap gap-2">
            {accentOptions.map((option) => (
              <label
                key={option.value}
                className="grid cursor-pointer gap-1 rounded-[8px] border border-[var(--hairline)] p-2 has-[:checked]:border-black has-[:checked]:bg-[var(--surface-soft)]"
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="color"
                  value={option.value}
                  defaultChecked={entry.color.toLowerCase() === option.value.toLowerCase()}
                />
                <span className="size-7 rounded-full border border-black/10" style={{ backgroundColor: option.value }} />
                <span className="text-xs">{option.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Visibility" htmlFor="entry-visibility" helper="Mate-tagged entries are shared with those users even if private.">
          <Select id="entry-visibility" name="visibility" defaultValue={entry.visibility} disabled={!canEdit}>
            <option value="private">Only me</option>
            <option value="friends">Friends feed</option>
          </Select>
        </Field>

        <fieldset className="grid gap-2" disabled={!canEdit}>
          <legend className="text-sm font-semibold">Mates</legend>
          <div className="overflow-hidden rounded-[8px] border border-[var(--hairline)]">
            {state.friends.length ? (
              state.friends.map((friend) => (
                <label
                  className="flex min-h-12 items-center gap-3 border-b border-[var(--hairline-soft)] px-3 py-2 last:border-b-0"
                  key={friend.id}
                >
                  <input
                    className="size-4"
                    type="checkbox"
                    name="mates"
                    value={friend.id}
                    defaultChecked={entry.mates.includes(friend.id)}
                  />
                  <span>
                    {friend.displayName} <small>@{friend.username}</small>
                  </span>
                </label>
              ))
            ) : (
              <div className="px-3 py-4">Add friends to tag mates.</div>
            )}
          </div>
        </fieldset>

        <Field label="Note" htmlFor="entry-note">
          <Textarea id="entry-note" name="note" defaultValue={entry.note} placeholder="What happened here?" disabled={!canEdit} />
        </Field>

        {entry.photos.length ? (
          <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-2">
            {entry.photos.map((photo) => {
              const src = photoSource(photo);
              return src ? (
                <figure className="relative aspect-square overflow-hidden rounded-[8px] bg-[var(--surface-soft)]" key={photo.id}>
                  <Image src={src} alt={photo.name || entry.placeName} fill unoptimized className="object-cover" sizes="160px" />
                  {selectedEntry && canEdit ? (
                    <button
                      className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-white/90"
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => onRemovePhoto(selectedEntry.id, photo.id)}
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </figure>
              ) : null;
            })}
          </div>
        ) : null}

        <Field label="Photos" htmlFor="entry-photos">
          <Input id="entry-photos" name="photos" type="file" accept="image/*" multiple disabled={!canEdit} />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!canEdit}>
            <ImagePlus className="size-4" />
            {selectedEntry ? "Save changes" : "Save place"}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

interface PlacesListBodyProps {
  entries: DiaryEntry[];
  totalEntries: number;
  query: string;
  sort: PlaceSort;
  filter: PlaceFilter;
  onQueryChange: (query: string) => void;
  onSortChange: (sort: PlaceSort) => void;
  onFilterChange: (filter: PlaceFilter) => void;
  onAddPlace: () => void;
  onOpenEntry: (entryId: string) => void;
}

export function PlacesListBody({
  entries,
  totalEntries,
  query,
  sort,
  filter,
  onQueryChange,
  onSortChange,
  onFilterChange,
  onAddPlace,
  onOpenEntry
}: PlacesListBodyProps) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge>{entries.length} shown</Badge>
        <Badge>{totalEntries} total</Badge>
        <Button size="sm" onClick={onAddPlace}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      <Field label="Search places" htmlFor="place-search">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input id="place-search" className="pl-9" value={query} onChange={(event) => onQueryChange(event.target.value)} />
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Sort" htmlFor="place-sort">
          <Select id="place-sort" value={sort} onChange={(event) => onSortChange(event.target.value as PlaceSort)}>
            <option value="updated">Recently updated</option>
            <option value="created">Newest added</option>
            <option value="name">Place name</option>
          </Select>
        </Field>
        <Field label="Filter" htmlFor="place-filter">
          <Select id="place-filter" value={filter} onChange={(event) => onFilterChange(event.target.value as PlaceFilter)}>
            <option value="all">All places</option>
            <option value="private">Private</option>
            <option value="shared">Shared</option>
            <option value="with-photos">With photos</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-3">
        {entries.length ? (
          entries.map((entry) => <EntryCard key={entry.id} entry={entry} onOpen={() => onOpenEntry(entry.id)} />)
        ) : (
          <p className="rounded-[8px] bg-[var(--surface-soft)] p-4">No places match this search.</p>
        )}
      </div>
    </div>
  );
}

function PlaceListPanel(props: PlacesListBodyProps) {
  return (
    <OverlayPanel eyebrow="Places" title="Saved list">
      <PlacesListBody {...props} />
    </OverlayPanel>
  );
}

function EntryCard({ entry, onOpen }: { entry: DiaryEntry; onOpen: () => void }) {
  const firstPhoto = entry.photos[0];
  const firstPhotoSrc = firstPhoto ? photoSource(firstPhoto) : "";

  return (
    <article className="overflow-hidden rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)]">
      <button className="relative aspect-[5/3] w-full bg-[var(--block-cream)]" onClick={onOpen} aria-label={`Open ${entry.title}`}>
        {firstPhotoSrc ? (
          <Image src={firstPhotoSrc} alt={firstPhoto?.name || entry.placeName} fill unoptimized sizes="420px" className="object-cover" />
        ) : (
          <MiniMap entry={entry} />
        )}
      </button>
      <div className="grid gap-3 p-4">
        <h3 className="text-2xl font-bold leading-tight">{entry.title || entry.placeName}</h3>
        <p className="line-clamp-2 text-base leading-snug">{entry.note || "Saved without a note yet."}</p>
        <div className="flex flex-wrap gap-2">
          <Badge>{entry.placeName}</Badge>
          <Badge>{formatDate(entry.updatedAt)}</Badge>
          {entry.mates.length ? <Badge>{entry.mates.length} mate{entry.mates.length === 1 ? "" : "s"}</Badge> : null}
        </div>
      </div>
    </article>
  );
}

interface FeedBodyProps {
  state: AppState;
  entries: DiaryEntry[];
  currentUserId: string;
  onOpenEntry: (entryId: string) => void;
}

export function FeedBody({ state, entries, currentUserId, onOpenEntry }: FeedBodyProps) {
  return (
    <>
      <div className="grid gap-3">
        {entries.length ? (
          entries.map((entry) => {
            const owner = getUser(state, entry.ownerId, currentUserId);
            const shared = entry.mates.includes(currentUserId) || entry.mates.length > 0;
            return (
              <article
                className={`grid gap-3 rounded-[8px] border border-[var(--hairline)] p-4 ${shared ? "bg-[var(--block-lime)]" : "bg-[var(--canvas)]"}`}
                key={entry.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar user={owner} />
                    <div>
                      <strong>{owner.displayName}</strong>
                      <div className="text-sm text-black/60">
                        @{owner.username} in {entry.placeName}
                      </div>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => onOpenEntry(entry.id)}>
                    Open
                  </Button>
                </div>
                <p className="text-lg leading-snug">{entry.note || entry.title}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge>{formatDate(entry.createdAt)}</Badge>
                  <Badge>{shared ? "Shared entry" : "Feed post"}</Badge>
                </div>
              </article>
            );
          })
        ) : (
          <p className="rounded-[8px] bg-[var(--surface-soft)] p-4">No visible friend activity yet.</p>
        )}
      </div>
    </>
  );
}

function FeedPanel(props: FeedBodyProps) {
  return (
    <OverlayPanel eyebrow="Feed" title="Common feed">
      <FeedBody {...props} />
    </OverlayPanel>
  );
}

interface FriendsBodyProps {
  state: AppState;
  suggestions: Friend[];
  onQueryChange: (query: string) => void;
  onAddFriend: (friend: Friend) => void;
  onToggleFollow: (userId: string) => void;
  onToggleFeed: (userId: string, visible: boolean) => void;
}

export function FriendsBody({
  state,
  suggestions,
  onQueryChange,
  onAddFriend,
  onToggleFollow,
  onToggleFeed
}: FriendsBodyProps) {
  const query = state.ui.friendQuery;

  return (
    <div className="grid gap-5">
        <Field label="Search username or email" htmlFor="friend-search">
          <Input id="friend-search" value={query} onChange={(event) => onQueryChange(event.target.value)} />
        </Field>

        <section className="grid gap-3">
          <h3 className="text-2xl font-semibold">Your friends</h3>
          {state.friends.length ? (
            state.friends.map((friend) => (
              <article className="grid gap-3 rounded-[8px] border border-[var(--hairline)] p-4" key={friend.id}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar user={friend} />
                    <div>
                      <strong>{friend.displayName}</strong>
                      <div className="text-sm text-black/60">
                        @{friend.username} · {friend.email}
                      </div>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => onToggleFollow(friend.id)}>
                    {friend.following ? "Following" : "Follow"}
                  </Button>
                </div>
                <label className="flex items-center gap-3">
                  <input
                    className="size-5"
                    type="checkbox"
                    checked={friend.feedVisible}
                    onChange={(event) => onToggleFeed(friend.id, event.target.checked)}
                  />
                  <span>Show feed posts from this friend</span>
                </label>
              </article>
            ))
          ) : (
            <p className="rounded-[8px] bg-[var(--surface-soft)] p-4">No friends added yet.</p>
          )}
        </section>

        <section className="grid gap-3">
          <h3 className="text-2xl font-semibold">Directory</h3>
          {suggestions.length ? (
            suggestions.map((person) => {
              const existing = state.friends.some((friend) => friend.id === person.id);
              return (
                <article className="grid gap-3 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] p-4" key={person.id}>
                  <div className="flex items-center gap-3">
                    <Avatar user={person} />
                    <div>
                      <strong>{person.displayName}</strong>
                      <div className="text-sm text-black/60">@{person.username}</div>
                    </div>
                  </div>
                  <Button variant={existing ? "secondary" : "primary"} disabled={existing} onClick={() => onAddFriend(person)}>
                    <UserPlus className="size-4" />
                    {existing ? "Added" : "Add friend"}
                  </Button>
                </article>
              );
            })
          ) : (
            <p className="rounded-[8px] bg-[var(--surface-soft)] p-4">Search for a username or email to add someone.</p>
          )}
        </section>
      </div>
  );
}

function FriendsPanel(props: FriendsBodyProps) {
  return (
    <OverlayPanel eyebrow="Friends" title="Mates and feeds">
      <FriendsBody {...props} />
    </OverlayPanel>
  );
}

interface SettingsBodyProps {
  state: AppState;
  isCloudMode: boolean;
  supabaseConfigured: boolean;
  onProfileSave: (profile: Partial<AppState["profile"]>) => void;
  onThemeChange: (theme: Partial<ThemeSettings>) => void;
  onSync: () => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
}

export function SettingsBody({
  state,
  isCloudMode,
  supabaseConfigured,
  onProfileSave,
  onThemeChange,
  onSync,
  onExport,
  onImport
}: SettingsBodyProps) {
  const storageBytes = new Blob([JSON.stringify(state)]).size;
  const photoCount = state.entries.reduce((total, entry) => total + entry.photos.length, 0);
  const theme = state.settings.theme;

  return (
    <div className="grid gap-5">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            onProfileSave({
              displayName: cleanText(formData.get("displayName")),
              username: cleanText(formData.get("username")),
              email: cleanText(formData.get("email")),
              privateByDefault: formData.has("privateByDefault"),
              feedVisible: formData.has("feedVisible")
            });
          }}
        >
          <Field label="Display name" htmlFor="display-name">
            <Input id="display-name" name="displayName" defaultValue={state.profile.displayName} required />
          </Field>
          <Field label="Username" htmlFor="username">
            <Input id="username" name="username" defaultValue={state.profile.username} required />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={state.profile.email} required />
          </Field>
          <label className="flex items-center gap-3">
            <input className="size-5" type="checkbox" name="privateByDefault" defaultChecked={state.profile.privateByDefault} />
            <span>New entries default to private</span>
          </label>
          <label className="flex items-center gap-3">
            <input className="size-5" type="checkbox" name="feedVisible" defaultChecked={state.profile.feedVisible} />
            <span>Friends can see my feed posts</span>
          </label>
          <Button className="w-fit" type="submit">
            Save account
          </Button>
        </form>

        <section className="grid gap-4 rounded-[8px] border border-[var(--hairline)] p-4">
          <div className="flex items-start gap-3">
            <Palette className="mt-1 size-5" />
            <div>
              <h3 className="text-2xl font-semibold">Scrapbook style</h3>
              <p className="mt-1 text-sm text-black/60">Changes auto-save locally and sync when cloud mode is active.</p>
            </div>
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-semibold">Accent token</legend>
            <div className="grid grid-cols-4 gap-2 max-sm:grid-cols-2">
              {accentOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`grid gap-2 rounded-[8px] border p-3 text-left transition active:scale-[0.98] ${
                    theme.accentColor.toLowerCase() === option.value.toLowerCase()
                      ? "border-black bg-[var(--surface-soft)]"
                      : "border-[var(--hairline)] bg-[var(--canvas)]"
                  }`}
                  onClick={() => onThemeChange({ accentColor: option.value })}
                >
                  <span className="size-8 rounded-full border border-black/10" style={{ backgroundColor: option.value }} />
                  <span className="text-sm font-semibold">{option.name}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Custom accent" htmlFor="custom-accent">
              <Input
                id="custom-accent"
                type="color"
                value={theme.accentColor}
                onChange={(event) => onThemeChange({ accentColor: event.target.value })}
              />
            </Field>
            <Field label="Page tint" htmlFor="canvas-color">
              <Input
                id="canvas-color"
                type="color"
                value={theme.canvasColor}
                onChange={(event) => onThemeChange({ canvasColor: event.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Panel tint" htmlFor="surface-color">
              <Input
                id="surface-color"
                type="color"
                value={theme.surfaceColor}
                onChange={(event) => onThemeChange({ surfaceColor: event.target.value })}
              />
            </Field>
            <Field label="Map style" htmlFor="map-style">
              <Select
                id="map-style"
                value={theme.mapStyle}
                onChange={(event) => onThemeChange({ mapStyle: event.target.value as MapTileStyle })}
              >
                {mapStyleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Google Font" htmlFor="font-family">
            <div className="relative">
              <Type className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Select
                id="font-family"
                className="pl-9"
                value={theme.fontFamily}
                onChange={(event) => onThemeChange({ fontFamily: event.target.value })}
              >
                {fontOptions.map((option) => (
                  <option key={option.family} value={option.family}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
        </section>

        <section className="grid gap-3 rounded-[8px] border border-[var(--hairline)] bg-[var(--block-lime)] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-2xl font-semibold">Sync</h3>
              <p className="mt-1 text-base leading-snug">
                {isCloudMode
                  ? "Supabase is active for auth, database rows, and photo storage. IndexedDB keeps a local offline copy."
                  : supabaseConfigured
                    ? "Local mode is active for this browser. Log in to turn on Supabase sync."
                    : "Supabase env vars are missing, so this browser is using IndexedDB and a local mirror."}
              </p>
            </div>
            <Button variant="secondary" onClick={onSync}>
              <Cloud className="size-4" />
              Sync
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{state.sync.remote}</Badge>
            <Badge>{state.sync.pendingChanges} pending</Badge>
            <Badge>{state.sync.lastSyncedAt ? `Last ${formatDate(state.sync.lastSyncedAt)}` : "Not synced yet"}</Badge>
          </div>
        </section>

        <section className="grid gap-3 rounded-[8px] border border-[var(--hairline)] p-4">
          <h3 className="text-2xl font-semibold">Storage</h3>
          <div className="flex flex-wrap gap-2">
            <Badge>{state.entries.length} entries</Badge>
            <Badge>{photoCount} photos</Badge>
            <Badge>{formatBytes(storageBytes)}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onExport}>
              <Download className="size-4" />
              Export data
            </Button>
            <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[50px] border border-[var(--hairline)] px-5 py-2.5 transition active:translate-y-px active:scale-[0.98]">
              <Upload className="size-4" />
              Import data
              <input
                className="sr-only"
                type="file"
                accept="application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onImport(file);
                }}
              />
            </label>
          </div>
        </section>
      </div>
  );
}

function SettingsPanel(props: SettingsBodyProps) {
  return (
    <OverlayPanel eyebrow="Settings" title="Account and sync">
      <SettingsBody {...props} />
    </OverlayPanel>
  );
}

function Field({
  label,
  htmlFor,
  helper,
  children
}: {
  label: string;
  htmlFor: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {helper ? <small className="text-sm leading-snug text-black/60">{helper}</small> : null}
    </div>
  );
}

function Avatar({ user }: { user: { displayName: string; color?: string } }) {
  const colorClass =
    user.color === "pink"
      ? "bg-[var(--block-pink)]"
      : user.color === "coral"
        ? "bg-[var(--block-coral)]"
        : user.color === "lilac"
          ? "bg-[var(--block-lilac)]"
          : "bg-[var(--block-mint)]";

  return (
    <span className={`grid size-10 shrink-0 place-items-center rounded-full border border-black font-bold ${colorClass}`}>
      {initials(user.displayName)}
    </span>
  );
}

function getVisibleMapEntries(state: AppState, currentUserId: string) {
  return state.entries.filter((entry) => entry.ownerId === currentUserId || entry.mates.includes(currentUserId));
}

function getFeedEntries(state: AppState, currentUserId: string) {
  return state.entries
    .filter((entry) => {
      if (entry.ownerId === currentUserId) {
        return state.profile.feedVisible && entry.visibility === "friends";
      }

      const owner = state.friends.find((friend) => friend.id === entry.ownerId);
      if (!owner?.following || !owner.feedVisible) return false;
      return entry.visibility === "friends" || entry.mates.includes(currentUserId);
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function getUser(state: AppState, id: string, currentUserId: string) {
  if (id === currentUserId) return { ...state.profile, color: "lilac" as const };
  return (
    state.friends.find((friend) => friend.id === id) ??
    directory.find((person) => person.id === id) ?? {
      displayName: "Unknown user",
      username: "unknown",
      color: "mint" as const
    }
  );
}

function filterAndSortEntries(
  entries: DiaryEntry[],
  query: string,
  filter: PlaceFilter,
  sort: PlaceSort,
  currentUserId: string
) {
  const normalizedQuery = query.trim().toLowerCase();
  return entries
    .filter((entry) => {
      const searchable = `${entry.title} ${entry.placeName} ${entry.note}`.toLowerCase();
      if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
      if (filter === "private") return entry.visibility === "private" && entry.ownerId === currentUserId;
      if (filter === "shared") return entry.mates.length > 0 || entry.ownerId !== currentUserId;
      if (filter === "with-photos") return entry.photos.length > 0;
      return true;
    })
    .sort((a, b) => {
      if (sort === "name") return a.placeName.localeCompare(b.placeName);
      if (sort === "created") return b.createdAt.localeCompare(a.createdAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

async function filesToPhotos(fileList: FileList | null): Promise<EntryPhoto[]> {
  const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));

  return Promise.all(
    files.map(
      (file) =>
        new Promise<EntryPhoto>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              id: createId("photo"),
              name: file.name,
              type: file.type,
              size: file.size,
              dataUrl: String(reader.result),
              createdAt: new Date().toISOString()
            });
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        })
    )
  );
}

function exportData(state: AppState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `map-diary-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getNamedFileList(form: HTMLFormElement, name: string) {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement ? field.files : null;
}

function directoryUserToFriend(person: (typeof directory)[number]): Friend {
  return {
    ...person,
    following: false,
    followsYou: false,
    feedVisible: true
  };
}

function photoSource(photo: EntryPhoto) {
  return photo.dataUrl || photo.signedUrl || "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function syncStatusLabel(status: AppState["sync"]["status"], isLocalMode: boolean) {
  if (status === "synced") return isLocalMode ? "Saved local" : "Synced";
  if (status === "syncing") return "Syncing";
  if (status === "offline") return "Offline";
  if (status === "error") return "Sync issue";
  return isLocalMode ? "Saved local" : "Pending";
}

function searchLocations(query: string): DraftLocation[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];

  return cityAtlas
    .filter(([name]) => name.toLowerCase().includes(normalized))
    .slice(0, 6)
    .map(([placeName, lat, lng]) => ({ placeName, lat, lng }));
}

function useGoogleFont(fontFamily: string) {
  React.useEffect(() => {
    if (!fontFamily || fontFamily === "System") return;

    const id = `google-font-${fontFamily.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    if (document.getElementById(id)) return;

    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, "+")}:wght@300;400;500;600;700&display=swap`;
    document.head.append(link);
  }, [fontFamily]);
}

function themeToCssVars(theme: ThemeSettings): React.CSSProperties & Record<`--${string}`, string> {
  const fontFamily =
    theme.fontFamily === "System"
      ? 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
      : `"${theme.fontFamily}", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`;

  return {
    "--primary": theme.accentColor,
    "--accent-magenta": theme.accentColor,
    "--on-primary": readableTextColor(theme.accentColor),
    "--canvas": theme.canvasColor,
    "--surface-soft": theme.surfaceColor,
    "--font-figma-sans": fontFamily
  };
}

function readableTextColor(hexColor: string) {
  const fallback = "#ffffff";
  const match = /^#?([0-9a-f]{6})$/i.exec(hexColor);
  if (!match) return fallback;

  const value = match[1];
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#111111" : "#ffffff";
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}
