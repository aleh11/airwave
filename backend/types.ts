export type PlaybackTarget = "browser" | "appliance";

export interface Station {
  id: number;
  name: string;
  url: string;
  favicon: string | null;
  tags: string[];
  country: string | null;
  codec: string | null;
  bitrate: number | null;
  favorite: boolean;
}

export interface StationInput {
  name: string;
  url: string;
  favicon?: string | null;
  tags?: string[];
  country?: string | null;
  codec?: string | null;
  bitrate?: number | null;
  favorite?: boolean;
}

export interface DiscoveryStation extends StationInput {
  externalId: string;
  votes: number;
}

export interface Alarm {
  at: string;
  stationId: number;
}

export interface OutputStatus {
  kind: "idle" | "ready" | "error";
  message: string | null;
}

export interface RadioState {
  station: Station | null;
  volume: number;
  playing: boolean;
  target: PlaybackTarget;
  nowPlaying: string | null;
  sleepTimerEndsAt: string | null;
  alarm: Alarm | null;
  outputStatus: OutputStatus;
  revision: number;
}

export type RadioCommand =
  | { type: "play" }
  | { type: "pause" }
  | { type: "togglePlayback" }
  | { type: "setVolume"; volume: number }
  | { type: "adjustVolume"; delta: number }
  | { type: "setStation"; station: Station | null }
  | { type: "setTarget"; target: PlaybackTarget }
  | { type: "setNowPlaying"; title: string | null }
  | { type: "setSleepTimer"; minutes: number }
  | { type: "clearSleepTimer" }
  | { type: "setAlarm"; alarm: Alarm }
  | { type: "clearAlarm" }
  | { type: "setOutputStatus"; status: OutputStatus };

export type CommandSource = "websocket" | "gpio" | "metadata" | "scheduler" | "system";

export interface StateChange {
  previous: RadioState;
  current: RadioState;
  command: RadioCommand;
  source: CommandSource;
}

export interface ListeningStats {
  totalPlays: number;
  totalListeningSeconds: number;
  uniqueStations: number;
  mostPlayed: Array<{
    stationId: number | null;
    stationName: string;
    plays: number;
    listeningSeconds: number;
  }>;
  recent: Array<{
    id: number;
    stationId: number | null;
    stationName: string;
    startedAt: string;
    endedAt: string | null;
    durationSeconds: number;
    nowPlaying: string | null;
  }>;
}

