import type { DiscoveryStation } from "./types.ts";

interface RadioBrowserStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  favicon: string;
  tags: string;
  countrycode: string;
  codec: string;
  bitrate: number;
  votes: number;
}

export interface DiscoveryQuery {
  name?: string;
  tag?: string;
  country?: string;
}

export class RadioBrowserClient {
  #server: string | null = null;
  #serverExpiresAt = 0;

  async search(query: DiscoveryQuery): Promise<DiscoveryStation[]> {
    const server = await this.#getServer();
    const params = new URLSearchParams({
      hidebroken: "true",
      order: "votes",
      reverse: "true",
      limit: "30",
    });
    if (query.name) params.set("name", query.name);
    if (query.tag) params.set("tag", query.tag);
    if (query.country) params.set("countrycode", query.country.toUpperCase());
    const response = await fetch(`${server}/json/stations/search?${params}`, {
      headers: { "User-Agent": "Airwave/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Radio Browser returned ${response.status}.`);
    }
    const stations = await response.json() as RadioBrowserStation[];
    return stations
      .filter((station) =>
        station.name.trim() && isHttpUrl(station.url_resolved)
      )
      .map((station) => ({
        externalId: station.stationuuid,
        name: station.name.trim(),
        url: station.url_resolved,
        favicon: isHttpUrl(station.favicon) ? station.favicon : null,
        tags: station.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
          .slice(0, 8),
        country: station.countrycode || null,
        codec: station.codec || null,
        bitrate: station.bitrate || null,
        votes: station.votes || 0,
      }));
  }

  async #getServer(): Promise<string> {
    if (this.#server && Date.now() < this.#serverExpiresAt) return this.#server;
    try {
      const response = await fetch(
        "https://all.api.radio-browser.info/json/servers",
        {
          headers: { "User-Agent": "Airwave/1.0" },
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!response.ok) throw new Error("Server discovery failed.");
      const servers = await response.json() as Array<{ name: string }>;
      const server = servers.map(({ name }) => name).find(Boolean);
      if (server) this.#server = `https://${server}`;
    } catch {
      this.#server = "https://de1.api.radio-browser.info";
    }
    this.#server ??= "https://de1.api.radio-browser.info";
    this.#serverExpiresAt = Date.now() + 3_600_000;
    return this.#server;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
