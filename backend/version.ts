import packageMetadata from "../package.json" with { type: "json" };

export interface VersionInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
}

export type UpdateState =
  | "unavailable"
  | "idle"
  | "requested"
  | "downloading"
  | "installing"
  | "restarting"
  | "complete"
  | "failed";

export interface UpdateStatus {
  state: UpdateState;
  version: string | null;
  message: string | null;
}

interface GitHubRelease {
  tag_name?: string;
  html_url?: string;
}

export class ReleaseVersionChecker {
  constructor(
    private readonly repository = "aleh11/airwave",
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  current(): VersionInfo {
    return {
      current: packageMetadata.version,
      latest: null,
      updateAvailable: false,
      releaseUrl: null,
    };
  }

  async check(): Promise<VersionInfo> {
    const response = await this.fetcher(
      `https://api.github.com/repos/${this.repository}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `Airwave/${packageMetadata.version}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status}.`);
    }
    const release = await response.json() as GitHubRelease;
    const latest = normalizeVersion(release.tag_name);
    if (!latest) {
      throw new Error("The latest release has no valid version tag.");
    }
    return {
      current: packageMetadata.version,
      latest,
      updateAvailable: isNewerVersion(latest, packageMetadata.version),
      releaseUrl: typeof release.html_url === "string"
        ? release.html_url
        : null,
    };
  }
}

export class ReleaseUpdateCoordinator {
  constructor(
    private readonly requestPath: string | null,
    private readonly statusPath = requestPath
      ? `${requestPath}.status.json`
      : null,
  ) {}

  static fromEnvironment(): ReleaseUpdateCoordinator {
    const requestPath = Deno.env.get("AIRWAVE_UPDATE_REQUEST_PATH") ?? null;
    const statusPath = Deno.env.get("AIRWAVE_UPDATE_STATUS_PATH") ??
      (requestPath ? `${requestPath}.status.json` : null);
    return new ReleaseUpdateCoordinator(requestPath, statusPath);
  }

  isEnabled(): boolean {
    return Boolean(this.requestPath && this.statusPath);
  }

  async request(version: string): Promise<UpdateStatus> {
    if (!this.requestPath || !this.statusPath) {
      throw new Error("Automatic updates are not configured on this device.");
    }
    if (!normalizeVersion(version)) {
      throw new Error("The requested release version is invalid.");
    }
    const status: UpdateStatus = {
      state: "requested",
      version,
      message: "The update has been queued.",
    };
    await Deno.writeTextFile(
      this.statusPath,
      `${JSON.stringify(status)}\n`,
    );
    await Deno.writeTextFile(this.requestPath, `${version}\n`);
    return status;
  }

  async status(): Promise<UpdateStatus> {
    if (!this.statusPath) {
      return {
        state: "unavailable",
        version: null,
        message: "Automatic updates are not configured on this device.",
      };
    }
    try {
      const status = parseUpdateStatus(
        await Deno.readTextFile(this.statusPath),
      );
      if (
        status.version === packageMetadata.version &&
        status.state !== "failed"
      ) {
        return {
          state: "complete",
          version: status.version,
          message: "Airwave is up to date.",
        };
      }
      return status;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return { state: "idle", version: null, message: null };
      }
      throw error;
    }
  }
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = versionParts(candidate);
  const currentParts = versionParts(current);
  for (let index = 0; index < 3; index++) {
    if (candidateParts[index] !== currentParts[index]) {
      return candidateParts[index] > currentParts[index];
    }
  }
  return false;
}

function normalizeVersion(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/^v/i, "") ?? "";
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized)
    ? normalized
    : null;
}

function parseUpdateStatus(value: string): UpdateStatus {
  const candidate = JSON.parse(value) as unknown;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("The update status file is invalid.");
  }
  const parsed = candidate as Record<string, unknown>;
  const states: UpdateState[] = [
    "unavailable",
    "idle",
    "requested",
    "downloading",
    "installing",
    "restarting",
    "complete",
    "failed",
  ];
  if (
    typeof parsed.state !== "string" ||
    !states.includes(parsed.state as UpdateState) ||
    (parsed.version !== null && typeof parsed.version !== "string") ||
    (parsed.message !== null && typeof parsed.message !== "string")
  ) {
    throw new Error("The update status file is invalid.");
  }
  return {
    state: parsed.state as UpdateState,
    version: parsed.version as string | null,
    message: parsed.message as string | null,
  };
}

function versionParts(version: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = version
    .replace(/^v/i, "")
    .split(/[.-]/, 3)
    .map((part) => Number(part) || 0);
  return [major, minor, patch];
}
