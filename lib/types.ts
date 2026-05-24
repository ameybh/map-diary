export type ViewId = "map" | "scrapbook" | "feed" | "friends" | "settings";

export type EntryIcon = "heart" | "pin" | "star" | "dot";

export type EntryVisibility = "private" | "friends";

export type SyncStatus = "pending" | "syncing" | "synced" | "offline" | "error";

export type MapTileStyle = "colorful" | "voyager" | "minimal";

export interface ThemeSettings {
  accentColor: string;
  canvasColor: string;
  surfaceColor: string;
  fontFamily: string;
  mapStyle: MapTileStyle;
}

export interface Profile {
  id: string;
  displayName: string;
  username: string;
  email: string;
  feedVisible: boolean;
  privateByDefault: boolean;
  preferredIcon: EntryIcon;
}

export interface Friend {
  id: string;
  displayName: string;
  username: string;
  email: string;
  following: boolean;
  followsYou: boolean;
  feedVisible: boolean;
  color: "mint" | "pink" | "coral" | "lilac";
}

export interface DirectoryUser {
  id: string;
  displayName: string;
  username: string;
  email: string;
  color: Friend["color"];
}

export interface EntryPhoto {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  storagePath?: string;
  signedUrl?: string;
  createdAt: string;
}

export interface AuthUserSummary {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export interface DiaryEntry {
  id: string;
  ownerId: string;
  title: string;
  placeName: string;
  note: string;
  lat: number;
  lng: number;
  icon: EntryIcon;
  color: string;
  visibility: EntryVisibility;
  mates: string[];
  photos: EntryPhoto[];
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  cloudEndpoint: string;
  syncMode: "local-mirror";
  theme: ThemeSettings;
}

export interface SyncState {
  status: SyncStatus;
  pendingChanges: number;
  lastSyncedAt: string;
  lastLocalSaveAt: string;
  remote: string;
  error: string;
}

export interface AppUiState {
  friendQuery: string;
}

export interface AppState {
  version: 1;
  updatedAt: string;
  profile: Profile;
  friends: Friend[];
  entries: DiaryEntry[];
  settings: AppSettings;
  sync: SyncState;
  ui: AppUiState;
}
