export const cityAtlas: Array<[name: string, lat: number, lng: number]> = [
  ["New York", 40.7128, -74.006],
  ["San Francisco", 37.7749, -122.4194],
  ["Mexico City", 19.4326, -99.1332],
  ["Toronto", 43.6532, -79.3832],
  ["Vancouver", 49.2827, -123.1207],
  ["Rio de Janeiro", -22.9068, -43.1729],
  ["Buenos Aires", -34.6037, -58.3816],
  ["Reykjavik", 64.1466, -21.9426],
  ["London", 51.5072, -0.1276],
  ["Paris", 48.8566, 2.3522],
  ["Barcelona", 41.3874, 2.1686],
  ["Rome", 41.9028, 12.4964],
  ["Istanbul", 41.0082, 28.9784],
  ["Cairo", 30.0444, 31.2357],
  ["Cape Town", -33.9249, 18.4241],
  ["Nairobi", -1.2921, 36.8219],
  ["Dubai", 25.2048, 55.2708],
  ["Mumbai", 19.076, 72.8777],
  ["Delhi", 28.6139, 77.209],
  ["Singapore", 1.3521, 103.8198],
  ["Bangkok", 13.7563, 100.5018],
  ["Seoul", 37.5665, 126.978],
  ["Tokyo", 35.6762, 139.6503],
  ["Sydney", -33.8688, 151.2093],
  ["Auckland", -36.8509, 174.7645]
];

export interface DraftLocation {
  lat: number;
  lng: number;
  placeName: string;
}

export function project(lat: number, lng: number) {
  return {
    x: ((lng + 180) / 360) * 1000,
    y: ((90 - lat) / 180) * 520
  };
}

export function inferLocation(lat: number, lng: number): DraftLocation {
  let nearest = "";
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [name, cityLat, cityLng] of cityAtlas) {
    const distance = Math.hypot(cityLat - lat, (cityLng - lng) * Math.cos((lat * Math.PI) / 180));
    if (distance < bestDistance) {
      nearest = name;
      bestDistance = distance;
    }
  }

  const placeName =
    bestDistance < 11
      ? nearest
      : `${Math.abs(lat).toFixed(1)} ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(1)} ${
          lng >= 0 ? "E" : "W"
        }`;

  return {
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4)),
    placeName
  };
}
