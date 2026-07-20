import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import type {
  Alarm,
  ListeningStats,
  PlaybackTarget,
  Station,
  StationInput,
} from "./types.ts";

export interface PersistedSettings {
  volume?: number;
  target?: PlaybackTarget;
  alarm?: Alarm | null;
}

interface StationRow {
  id: number;
  name: string;
  url: string;
  favicon: string | null;
  tags: string;
  country: string | null;
  codec: string | null;
  bitrate: number | null;
  favorite: number;
}

export class RadioDatabase {
  #db: DatabaseSync;

  private constructor(path: string) {
    this.#db = new DatabaseSync(path);
    this.#db.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
    );
    this.#migrate();
  }

  static async open(path: string): Promise<RadioDatabase> {
    if (path !== ":memory:") {
      await Deno.mkdir(dirname(path), { recursive: true });
    }
    return new RadioDatabase(path);
  }

  close(): void {
    this.#db.close();
  }

  listStations(): Station[] {
    const rows = this.#db.prepare(`
      SELECT s.id, s.name, s.url, s.favicon, s.tags, s.country, s.codec, s.bitrate,
        CASE WHEN f.station_id IS NULL THEN 0 ELSE 1 END AS favorite
      FROM stations s
      LEFT JOIN favorites f ON f.station_id = s.id
      ORDER BY favorite DESC, s.name COLLATE NOCASE
    `).all() as unknown as StationRow[];
    return rows.map(mapStation);
  }

  getStation(id: number): Station | null {
    const row = this.#db.prepare(`
      SELECT s.id, s.name, s.url, s.favicon, s.tags, s.country, s.codec, s.bitrate,
        CASE WHEN f.station_id IS NULL THEN 0 ELSE 1 END AS favorite
      FROM stations s
      LEFT JOIN favorites f ON f.station_id = s.id
      WHERE s.id = ?
    `).get(id) as unknown as StationRow | undefined;
    return row ? mapStation(row) : null;
  }

  createStation(input: StationInput): Station {
    const result = this.#db.prepare(`
      INSERT INTO stations (name, url, favicon, tags, country, codec, bitrate)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.name,
      input.url,
      input.favicon ?? null,
      JSON.stringify(input.tags ?? []),
      input.country ?? null,
      input.codec ?? null,
      input.bitrate ?? null,
    );
    const id = Number(result.lastInsertRowid);
    if (input.favorite) this.setFavorite(id, true);
    return this.getStation(id)!;
  }

  updateStation(id: number, input: StationInput): Station | null {
    const result = this.#db.prepare(`
      UPDATE stations
      SET name = ?, url = ?, favicon = ?, tags = ?, country = ?, codec = ?, bitrate = ?
      WHERE id = ?
    `).run(
      input.name,
      input.url,
      input.favicon ?? null,
      JSON.stringify(input.tags ?? []),
      input.country ?? null,
      input.codec ?? null,
      input.bitrate ?? null,
      id,
    );
    if (result.changes === 0) return null;
    if (typeof input.favorite === "boolean") {
      this.setFavorite(id, input.favorite);
    }
    return this.getStation(id);
  }

  deleteStation(id: number): boolean {
    return this.#db.prepare("DELETE FROM stations WHERE id = ?").run(id)
      .changes > 0;
  }

  setFavorite(id: number, favorite: boolean): Station | null {
    if (!this.getStation(id)) return null;
    if (favorite) {
      this.#db.prepare(
        "INSERT OR IGNORE INTO favorites (station_id) VALUES (?)",
      ).run(id);
    } else {
      this.#db.prepare("DELETE FROM favorites WHERE station_id = ?").run(id);
    }
    return this.getStation(id);
  }

  beginListening(station: Station, startedAt: string): number {
    const result = this.#db.prepare(`
      INSERT INTO history (station_id, station_name, started_at)
      VALUES (?, ?, ?)
    `).run(station.id, station.name, startedAt);
    return Number(result.lastInsertRowid);
  }

  finishListening(id: number, endedAt: string, durationSeconds: number): void {
    this.#db.prepare(`
      UPDATE history SET ended_at = ?, duration_seconds = ? WHERE id = ?
    `).run(endedAt, Math.max(0, Math.round(durationSeconds)), id);
  }

  updateListeningTitle(id: number, title: string | null): void {
    this.#db.prepare("UPDATE history SET now_playing = ? WHERE id = ?").run(
      title,
      id,
    );
  }

  getStats(): ListeningStats {
    const summary = this.#db.prepare(`
      SELECT COUNT(*) AS totalPlays,
        COALESCE(SUM(duration_seconds), 0) AS totalListeningSeconds,
        COUNT(DISTINCT station_id) AS uniqueStations
      FROM history
    `).get() as unknown as {
      totalPlays: number;
      totalListeningSeconds: number;
      uniqueStations: number;
    };
    const mostPlayed = this.#db.prepare(`
      SELECT station_id AS stationId, station_name AS stationName, COUNT(*) AS plays,
        COALESCE(SUM(duration_seconds), 0) AS listeningSeconds
      FROM history
      GROUP BY station_id, station_name
      ORDER BY plays DESC, listeningSeconds DESC
      LIMIT 8
    `).all() as unknown as ListeningStats["mostPlayed"];
    const recent = this.#db.prepare(`
      SELECT id, station_id AS stationId, station_name AS stationName,
        started_at AS startedAt, ended_at AS endedAt,
        duration_seconds AS durationSeconds, now_playing AS nowPlaying
      FROM history
      ORDER BY started_at DESC
      LIMIT 20
    `).all() as unknown as ListeningStats["recent"];
    return { ...summary, mostPlayed, recent };
  }

  getSettings(): PersistedSettings {
    const rows = this.#db.prepare("SELECT key, value FROM settings")
      .all() as unknown as Array<{
        key: string;
        value: string;
      }>;
    const settings: PersistedSettings = {};
    for (const row of rows) {
      try {
        if (row.key === "volume") {
          settings.volume = Number(JSON.parse(row.value));
        }
        if (row.key === "target") settings.target = JSON.parse(row.value);
        if (row.key === "alarm") settings.alarm = JSON.parse(row.value);
      } catch {
        continue;
      }
    }
    return settings;
  }

  setSetting(key: "volume" | "target" | "alarm", value: unknown): void {
    this.#db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, JSON.stringify(value));
  }

  #migrate(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS stations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        favicon TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        country TEXT,
        codec TEXT,
        bitrate INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS favorites (
        station_id INTEGER PRIMARY KEY REFERENCES stations(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id INTEGER REFERENCES stations(id) ON DELETE SET NULL,
        station_name TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        now_playing TEXT
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS history_station_idx ON history(station_id);
      CREATE INDEX IF NOT EXISTS history_started_idx ON history(started_at DESC);
      UPDATE history SET ended_at = started_at WHERE ended_at IS NULL;
    `);
    const count = this.#db.prepare("SELECT COUNT(*) AS count FROM stations")
      .get() as unknown as {
        count: number;
      };
    if (count.count === 0) this.#seed();
  }

  #seed(): void {
    const stations: StationInput[] = [
      {
        name: "Groove Salad",
        url: "https://ice2.somafm.com/groovesalad-128-mp3",
        favicon: "https://somafm.com/img3/groovesalad-400.jpg",
        tags: ["ambient", "downtempo"],
        country: "US",
        codec: "MP3",
        bitrate: 128,
        favorite: true,
      },
      {
        name: "Drone Zone",
        url: "https://ice2.somafm.com/dronezone-128-mp3",
        favicon: "https://somafm.com/img3/dronezone-400.jpg",
        tags: ["ambient", "drone"],
        country: "US",
        codec: "MP3",
        bitrate: 128,
        favorite: true,
      },
    ];
    for (const station of stations) this.createStation(station);
  }
}

function mapStation(row: StationRow): Station {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags);
    if (Array.isArray(parsed)) {
      tags = parsed.filter((value) => typeof value === "string");
    }
  } catch {
    tags = row.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  }
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    favicon: row.favicon,
    tags,
    country: row.country,
    codec: row.codec,
    bitrate: row.bitrate,
    favorite: Boolean(row.favorite),
  };
}
