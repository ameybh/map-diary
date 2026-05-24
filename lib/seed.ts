import { createId } from "@/lib/utils";
import type { AppState, DirectoryUser } from "@/lib/types";

export const CURRENT_USER_ID = "local-user";

export const directory: DirectoryUser[] = [
  {
    id: "user-iza",
    displayName: "Izaan Menon",
    username: "izaan",
    email: "izaan@example.com",
    color: "mint"
  },
  {
    id: "user-sol",
    displayName: "Sol Almeida",
    username: "solroutes",
    email: "sol@example.com",
    color: "pink"
  },
  {
    id: "user-nora",
    displayName: "Nora Okafor",
    username: "nora.notes",
    email: "nora@example.com",
    color: "coral"
  },
  {
    id: "user-emi",
    displayName: "Emi Tanaka",
    username: "emi.t",
    email: "emi@example.com",
    color: "lilac"
  }
];

export function seedState(): AppState {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const lastWeek = new Date(Date.now() - 86400000 * 7).toISOString();

  return {
    version: 1,
    updatedAt: now,
    profile: {
      id: CURRENT_USER_ID,
      displayName: "Mira Rao",
      username: "mira.maps",
      email: "mira@example.com",
      feedVisible: true,
      privateByDefault: true,
      preferredIcon: "heart"
    },
    friends: [
      {
        ...directory[0],
        following: true,
        followsYou: true,
        feedVisible: true
      },
      {
        ...directory[1],
        following: true,
        followsYou: false,
        feedVisible: true
      }
    ],
    entries: [
      {
        id: createId("entry"),
        ownerId: CURRENT_USER_ID,
        title: "Late train, perfect ramen",
        placeName: "Tokyo",
        note:
          "Rain outside Shinjuku Station, a narrow counter, and the kind of broth that makes the whole day slow down.",
        lat: 35.6762,
        lng: 139.6503,
        icon: "heart",
        color: "#000000",
        visibility: "friends",
        mates: ["user-iza"],
        photos: [],
        createdAt: lastWeek,
        updatedAt: lastWeek
      },
      {
        id: createId("entry"),
        ownerId: CURRENT_USER_ID,
        title: "Blue hour by the sea",
        placeName: "Mumbai",
        note:
          "Walked until the road curved into the water. Saved the place because it felt like the city exhaled here.",
        lat: 19.076,
        lng: 72.8777,
        icon: "pin",
        color: "#1f1d3d",
        visibility: "private",
        mates: [],
        photos: [],
        createdAt: yesterday,
        updatedAt: yesterday
      },
      {
        id: createId("entry"),
        ownerId: "user-sol",
        title: "Shared market morning",
        placeName: "Barcelona",
        note: "Sol tagged you on the first coffee stop before the long walk through Gracia.",
        lat: 41.3874,
        lng: 2.1686,
        icon: "star",
        color: "#ff3d8b",
        visibility: "friends",
        mates: [CURRENT_USER_ID],
        photos: [],
        createdAt: now,
        updatedAt: now
      }
    ],
    settings: {
      cloudEndpoint: "",
      syncMode: "local-mirror",
      theme: {
        accentColor: "#ff5a7a",
        canvasColor: "#ffffff",
        surfaceColor: "#f7f7f5",
        fontFamily: "Figtree",
        mapStyle: "colorful"
      }
    },
    sync: {
      status: "pending",
      pendingChanges: 1,
      lastSyncedAt: "",
      lastLocalSaveAt: now,
      remote: "Local mirror",
      error: ""
    },
    ui: {
      friendQuery: ""
    }
  };
}

export function normalizeState(state: Partial<AppState> | null | undefined): AppState {
  const seed = seedState();

  if (!state) return seed;

  return {
    ...seed,
    ...state,
    profile: { ...seed.profile, ...state.profile },
    friends: Array.isArray(state.friends) ? state.friends : seed.friends,
    entries: Array.isArray(state.entries) ? state.entries : seed.entries,
    settings: { ...seed.settings, ...state.settings, theme: { ...seed.settings.theme, ...state.settings?.theme } },
    sync: { ...seed.sync, ...state.sync },
    ui: { ...seed.ui, ...state.ui }
  };
}
