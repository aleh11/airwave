import { RadioDatabase } from "./db.ts";
import { BluetoothError, BluetoothManager } from "./bluetooth.ts";
import { RadioBrowserClient } from "./radiobrowser.ts";
import type { RadioStateMachine } from "./state.ts";
import type { StationInput } from "./types.ts";
import {
  ReleaseUpdateCoordinator,
  ReleaseVersionChecker,
} from "./version.ts";

type VersionChecker = Pick<ReleaseVersionChecker, "current" | "check">;
type UpdateCoordinator = Pick<
  ReleaseUpdateCoordinator,
  "isEnabled" | "request" | "status"
>;

export interface ApiDependencies {
  versionChecker?: VersionChecker;
  updateCoordinator?: UpdateCoordinator;
}

const stationPattern = new URLPattern({ pathname: "/api/stations/:id" });
const favoritePattern = new URLPattern({
  pathname: "/api/stations/:id/favorite",
});
const audioDevicePattern = new URLPattern({
  pathname: "/api/audio/devices/:address",
});
const audioDeviceActionPattern = new URLPattern({
  pathname: "/api/audio/devices/:address/:action",
});

export function createApiHandler(
  database: RadioDatabase,
  discovery: RadioBrowserClient,
  machine: RadioStateMachine,
  bluetooth: BluetoothManager,
  dependencies: ApiDependencies = {},
): (request: Request) => Promise<Response> {
  const versionChecker = dependencies.versionChecker ??
    new ReleaseVersionChecker();
  const updateCoordinator = dependencies.updateCoordinator ??
    ReleaseUpdateCoordinator.fromEnvironment();
  return async (request) => {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/health" && request.method === "GET") {
        return json({ ok: true, stateRevision: machine.state.revision });
      }
      if (url.pathname === "/api/version" && request.method === "GET") {
        return json(versionChecker.current());
      }
      if (
        url.pathname === "/api/version/check" && request.method === "GET"
      ) {
        try {
          return json(await versionChecker.check());
        } catch (error) {
          const detail = error instanceof Error
            ? error.message
            : "Unknown error";
          throw new ApiError(502, `Could not check for updates: ${detail}`);
        }
      }
      if (
        url.pathname === "/api/version/update" && request.method === "GET"
      ) {
        return json(await updateCoordinator.status());
      }
      if (
        url.pathname === "/api/version/update" && request.method === "POST"
      ) {
        if (!updateCoordinator.isEnabled()) {
          throw new ApiError(
            503,
            "Automatic updates are only available on an installed Airwave device.",
          );
        }
        let version;
        try {
          version = await versionChecker.check();
        } catch (error) {
          const detail = error instanceof Error
            ? error.message
            : "Unknown error";
          throw new ApiError(502, `Could not start the update: ${detail}`);
        }
        if (!version.updateAvailable || !version.latest) {
          return json({
            state: "complete",
            version: version.current,
            message: "Airwave is already up to date.",
          });
        }
        return json(await updateCoordinator.request(version.latest), 202);
      }
      if (url.pathname === "/api/audio" && request.method === "GET") {
        return json(
          await bluetooth.getStatus(
            url.searchParams.get("audioOnly") === "true",
          ),
        );
      }
      if (url.pathname === "/api/audio/scan" && request.method === "POST") {
        const input = asObject(await readOptionalJson(request));
        const seconds = input.seconds === undefined
          ? 8
          : numberInRange(input.seconds, 3, 30, "Scan duration");
        return json(
          await bluetooth.scan(seconds, input.audioOnly === true),
        );
      }
      if (url.pathname === "/api/audio/output" && request.method === "PUT") {
        const input = asObject(await readJson(request));
        if (input.address !== null && typeof input.address !== "string") {
          throw new ApiError(
            400,
            "Audio device address must be a string or null.",
          );
        }
        return json(await bluetooth.select(input.address));
      }
      const audioDeviceActionMatch = audioDeviceActionPattern.exec(url);
      if (audioDeviceActionMatch && request.method === "POST") {
        const address = audioDeviceActionMatch.pathname.groups.address ?? "";
        switch (audioDeviceActionMatch.pathname.groups.action) {
          case "pair":
            return json(await bluetooth.pair(address));
          case "connect":
            return json(await bluetooth.connect(address));
          case "disconnect":
            return json(await bluetooth.disconnect(address));
          default:
            return notFound("Audio device action not found.");
        }
      }
      const audioDeviceMatch = audioDevicePattern.exec(url);
      if (audioDeviceMatch && request.method === "DELETE") {
        return json(
          await bluetooth.forget(
            audioDeviceMatch.pathname.groups.address ?? "",
          ),
        );
      }
      if (url.pathname === "/api/stations" && request.method === "GET") {
        return json({ stations: database.listStations() });
      }
      if (url.pathname === "/api/stations" && request.method === "POST") {
        const station = database.createStation(
          validateStation(await readJson(request)),
        );
        return json({ station }, 201);
      }
      const favoriteMatch = favoritePattern.exec(url);
      if (
        favoriteMatch &&
        (request.method === "PUT" || request.method === "DELETE")
      ) {
        const id = parseId(favoriteMatch.pathname.groups.id);
        const station = database.setFavorite(id, request.method === "PUT");
        if (station && machine.state.station?.id === id) {
          machine.dispatch({ type: "setStation", station }, "system");
        }
        return station ? json({ station }) : notFound("Station not found.");
      }
      const stationMatch = stationPattern.exec(url);
      if (stationMatch && request.method === "GET") {
        const station = database.getStation(
          parseId(stationMatch.pathname.groups.id),
        );
        return station ? json({ station }) : notFound("Station not found.");
      }
      if (stationMatch && request.method === "PUT") {
        const id = parseId(stationMatch.pathname.groups.id);
        const station = database.updateStation(
          id,
          validateStation(await readJson(request)),
        );
        if (!station) return notFound("Station not found.");
        if (machine.state.station?.id === id) {
          machine.dispatch({ type: "setStation", station }, "system");
        }
        return json({ station });
      }
      if (stationMatch && request.method === "DELETE") {
        const id = parseId(stationMatch.pathname.groups.id);
        if (machine.state.station?.id === id) {
          machine.dispatch({ type: "pause" }, "system");
          machine.dispatch({ type: "setStation", station: null }, "system");
        }
        return database.deleteStation(id)
          ? new Response(null, { status: 204 })
          : notFound("Station not found.");
      }
      if (url.pathname === "/api/discover" && request.method === "GET") {
        const stations = await discovery.search({
          name: url.searchParams.get("name") || undefined,
          tag: url.searchParams.get("tag") || undefined,
          country: url.searchParams.get("country") || undefined,
        });
        return json({ stations });
      }
      if (url.pathname === "/api/stats" && request.method === "GET") {
        return json(database.getStats());
      }
      return notFound("Route not found.");
    } catch (error) {
      if (error instanceof BluetoothError) {
        return json({ error: error.message }, error.status);
      }
      if (error instanceof ApiError) {
        return json({ error: error.message }, error.status);
      }
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed")
      ) {
        return json({ error: "That stream is already saved." }, 409);
      }
      console.error(error);
      return json({ error: "The request could not be completed." }, 500);
    }
  };
}

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64_000) {
    throw new ApiError(413, "Request body is too large.");
  }
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
}

async function readOptionalJson(request: Request): Promise<unknown> {
  return request.body === null ? {} : await readJson(request);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function numberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    typeof value !== "number" || !Number.isFinite(value) || value < minimum ||
    value > maximum
  ) {
    throw new ApiError(
      400,
      `${label} must be between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function validateStation(value: unknown): StationInput {
  if (!value || typeof value !== "object") {
    throw new ApiError(400, "Station details are required.");
  }
  const input = value as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
  if (!name || name.length > 160) {
    throw new ApiError(400, "Station name is required.");
  }
  if (!isHttpUrl(rawUrl)) {
    throw new ApiError(400, "Stream URL must use HTTP or HTTPS.");
  }
  return {
    name,
    url: rawUrl,
    favicon: typeof input.favicon === "string" && isHttpUrl(input.favicon)
      ? input.favicon
      : null,
    tags: Array.isArray(input.tags)
      ? input.tags.filter((tag): tag is string => typeof tag === "string").map((
        tag,
      ) => tag.trim())
        .filter(Boolean).slice(0, 12)
      : [],
    country: typeof input.country === "string"
      ? input.country.slice(0, 80)
      : null,
    codec: typeof input.codec === "string" ? input.codec.slice(0, 30) : null,
    bitrate: typeof input.bitrate === "number" && Number.isFinite(input.bitrate)
      ? Math.max(0, Math.round(input.bitrate))
      : null,
    favorite: typeof input.favorite === "boolean" ? input.favorite : undefined,
  };
}

function parseId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, "Station id is invalid.");
  }
  return id;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function notFound(message: string): Response {
  return json({ error: message }, 404);
}
