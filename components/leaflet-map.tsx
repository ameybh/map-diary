"use client";

import Image from "next/image";
import * as React from "react";
import L, { type DivIcon } from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { DiaryEntry, EntryIcon, EntryPhoto, Friend, MapTileStyle } from "@/lib/types";
import { inferLocation, type DraftLocation } from "@/lib/map";
import { cn } from "@/lib/utils";

interface DiaryLeafletMapProps {
  entries: DiaryEntry[];
  friends: Friend[];
  currentUserId: string;
  selectedEntryId: string | null;
  mapStyle: MapTileStyle;
  onPickLocation: (location: DraftLocation) => void;
  onSelectEntry: (entryId: string) => void;
  className?: string;
}

const TILE_STYLES: Record<MapTileStyle, { label: string; url: string; attribution: string; maxNativeZoom: number }> = {
  colorful: {
    label: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxNativeZoom: 19
  },
  voyager: {
    label: "OpenStreetMap / CARTO",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxNativeZoom: 19
  },
  minimal: {
    label: "OpenStreetMap / CARTO",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxNativeZoom: 19
  }
};

export function DiaryLeafletMap({
  entries,
  friends,
  currentUserId,
  selectedEntryId,
  mapStyle,
  onPickLocation,
  onSelectEntry,
  className
}: DiaryLeafletMapProps) {
  const tileStyle = TILE_STYLES[mapStyle] ?? TILE_STYLES.colorful;
  const selectedEntry = React.useMemo(
    () => (selectedEntryId ? entries.find((entry) => entry.id === selectedEntryId) ?? null : null),
    [entries, selectedEntryId]
  );
  const center = React.useMemo<[number, number]>(() => {
    if (!entries.length) return [20, 20];
    const entry = selectedEntry ?? entries[entries.length - 1];
    return [entry.lat, entry.lng];
  }, [entries, selectedEntry]);
  const [isCoarsePointer, setIsCoarsePointer] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarsePointer(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <div className={cn("map-shell relative", className)} aria-label="Interactive world map">
      <MapContainer
        center={center}
        zoom={2}
        minZoom={2}
        maxZoom={18}
        maxBounds={[
          [-85, -180],
          [85, 180]
        ]}
        maxBoundsViscosity={0.8}
        scrollWheelZoom
        worldCopyJump
        zoomControl={false}
        attributionControl={false}
        className="diary-leaflet-map"
      >
        <TileLayer
          key={mapStyle}
          url={tileStyle.url}
          attribution={tileStyle.attribution}
          detectRetina
          maxNativeZoom={tileStyle.maxNativeZoom}
        />
        <MapEvents onPickLocation={onPickLocation} />
        <MapSelectionSync entry={selectedEntry} isCoarsePointer={isCoarsePointer} />
        {entries.map((entry) => (
          <Marker
            key={entry.id}
            position={[entry.lat, entry.lng]}
            icon={createMarkerIcon(entry.icon, selectedEntryId === entry.id, entry.color)}
            eventHandlers={{
              click: () => onSelectEntry(entry.id)
            }}
          >
            {isCoarsePointer ? null : (
              <Tooltip direction="top" offset={[0, -18]} opacity={1} className="diary-pin-tooltip">
                <PinTooltip entry={entry} friends={friends} currentUserId={currentUserId} />
              </Tooltip>
            )}
          </Marker>
        ))}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-[50px] bg-white/90 px-3 py-1.5 text-xs">
        {tileStyle.label}
      </div>
    </div>
  );
}

function MapEvents({ onPickLocation }: { onPickLocation: (location: DraftLocation) => void }) {
  useMapEvents({
    click(event) {
      onPickLocation(inferLocation(event.latlng.lat, event.latlng.lng));
    }
  });

  return null;
}

function MapSelectionSync({
  entry,
  isCoarsePointer
}: {
  entry: DiaryEntry | null;
  isCoarsePointer: boolean;
}) {
  const map = useMap();
  const lastId = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!entry) {
      lastId.current = null;
      return;
    }
    if (lastId.current === entry.id) return;
    lastId.current = entry.id;

    const zoom = Math.max(map.getZoom(), 6);
    if (isCoarsePointer) {
      const point = map.project([entry.lat, entry.lng], zoom);
      const drawerOffsetPx = Math.round(window.innerHeight * 0.22);
      const target = map.unproject([point.x, point.y + drawerOffsetPx], zoom);
      map.setView(target, zoom, { animate: true });
    } else {
      map.setView([entry.lat, entry.lng], zoom, { animate: true });
    }
  }, [entry, isCoarsePointer, map]);

  return null;
}

function PinTooltip({
  entry,
  friends,
  currentUserId
}: {
  entry: DiaryEntry;
  friends: Friend[];
  currentUserId: string;
}) {
  const firstPhoto = entry.photos[0];
  const photoSrc = firstPhoto ? photoSource(firstPhoto) : "";
  const mateNames = entry.mates
    .map((mateId) => (mateId === currentUserId ? "You" : friends.find((friend) => friend.id === mateId)?.displayName))
    .filter(Boolean)
    .join(", ");

  return (
    <div className="grid w-[230px] gap-2 p-1">
      {photoSrc ? (
        <div className="relative h-24 overflow-hidden rounded-[8px] bg-[var(--surface-soft)]">
          <Image src={photoSrc} alt={firstPhoto?.name || entry.placeName} fill unoptimized sizes="230px" className="object-cover" />
        </div>
      ) : null}
      <div>
        <strong className="block text-base leading-tight">{entry.title || entry.placeName}</strong>
        <span className="text-xs text-black/60">{entry.placeName}</span>
      </div>
      {entry.note ? <p className="line-clamp-3 text-sm leading-snug">{entry.note}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-[50px] bg-[var(--surface-soft)] px-2 py-1 text-xs">
          {entry.visibility === "friends" ? "Friends feed" : "Private"}
        </span>
        {mateNames ? <span className="rounded-[50px] bg-[var(--surface-soft)] px-2 py-1 text-xs">With {mateNames}</span> : null}
      </div>
    </div>
  );
}

function createMarkerIcon(icon: EntryIcon, selected: boolean, color: string): DivIcon {
  const iconMarkup = iconToMarkup(icon);
  const selectedClass = selected ? " is-selected" : "";
  const markerColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "var(--primary)";

  return L.divIcon({
    className: `diary-marker${selectedClass}`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    tooltipAnchor: [0, -18],
    html: `<span class="diary-marker-inner" style="--marker-color:${markerColor}">${iconMarkup}</span>`
  });
}

function photoSource(photo: EntryPhoto) {
  return photo.dataUrl || photo.signedUrl || "";
}

function iconToMarkup(icon: EntryIcon) {
  if (icon === "heart") return HeartIcon;
  if (icon === "star") return StarIcon;
  if (icon === "dot") return DotIcon;
  return PinIcon;
}

const HeartIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 5.6c-1.9-1.8-4.8-1.6-6.5.4l-1 1.2-1-1.2C9.3 4 6.4 3.8 4.5 5.6c-2.1 2-2 5.4.2 7.5L12 20l7.3-6.9c2.2-2.1 2.3-5.5.2-7.5Z" fill="currentColor"/></svg>';

const PinIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8a7.2 7.2 0 0 0-7.2 7.2c0 5.4 7.2 11.2 7.2 11.2s7.2-5.8 7.2-11.2A7.2 7.2 0 0 0 12 2.8Zm0 9.7a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" fill="currentColor"/></svg>';

const StarIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.7 5.7 6.2.8-4.6 4.3 1.2 6.1-5.5-3-5.5 3 1.2-6.1-4.6-4.3 6.2-.8L12 2.8Z" fill="currentColor"/></svg>';

const DotIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.2" fill="currentColor"/></svg>';
