import type { DiscoveryStation, ListeningStats, Station } from "./types.ts";

export interface StationDraft {
  name: string;
  url: string;
  favicon?: string | null;
  tags?: string[];
  country?: string | null;
  codec?: string | null;
  bitrate?: number | null;
  favorite?: boolean;
}

export async function getStations(): Promise<Station[]> {
  return (await request<{ stations: Station[] }>("/api/stations")).stations;
}

export async function createStation(draft: StationDraft): Promise<Station> {
  return (await request<{ station: Station }>("/api/stations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  })).station;
}

export async function updateStation(id: number, draft: StationDraft): Promise<Station> {
  return (await request<{ station: Station }>(`/api/stations/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  })).station;
}

export async function removeStation(id: number): Promise<void> {
  await request(`/api/stations/${id}`, { method: "DELETE" });
}

export async function setFavorite(id: number, favorite: boolean): Promise<Station> {
  return (await request<{ station: Station }>(`/api/stations/${id}/favorite`, {
    method: favorite ? "PUT" : "DELETE",
  })).station;
}

export async function discoverStations(query: {
  name: string;
  tag: string;
  country: string;
}): Promise<DiscoveryStation[]> {
  const params = new URLSearchParams();
  if (query.name.trim()) params.set("name", query.name.trim());
  if (query.tag.trim()) params.set("tag", query.tag.trim());
  if (query.country.trim()) params.set("country", query.country.trim());
  return (await request<{ stations: DiscoveryStation[] }>(`/api/discover?${params}`)).stations;
}

export async function getStats(): Promise<ListeningStats> {
  return await request<ListeningStats>("/api/stats");
}

async function request<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed with ${response.status}.`);
  return body as T;
}
