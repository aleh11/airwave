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

export interface DiscoveryStation {
  externalId: string;
  name: string;
  url: string;
  favicon: string | null;
  tags: string[];
  country: string | null;
  codec: string | null;
  bitrate: number | null;
  votes: number;
}

export interface Alarm {
  at: string;
  stationId: number;
}

export interface RadioState {
  station: Station | null;
  volume: number;
  playing: boolean;
  target: PlaybackTarget;
  nowPlaying: string | null;
  sleepTimerEndsAt: string | null;
  alarm: Alarm | null;
  outputStatus: {
    kind: "idle" | "ready" | "error";
    message: string | null;
  };
  revision: number;
}

export type RadioCommand =
  | { type: "play" }
  | { type: "pause" }
  | { type: "togglePlayback" }
  | { type: "setVolume"; volume: number }
  | { type: "setStation"; station: Station | null }
  | { type: "setTarget"; target: PlaybackTarget }
  | { type: "setSleepTimer"; minutes: number }
  | { type: "clearSleepTimer" }
  | { type: "setAlarm"; alarm: Alarm }
  | { type: "clearAlarm" };

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

export interface BluetoothDevice {
  address: string;
  name: string;
  alias: string;
  icon: string | null;
  paired: boolean;
  trusted: boolean;
  connected: boolean;
  blocked: boolean;
  audioCapable: boolean;
  uuids: string[];
}

export interface BluetoothAudioStatus {
  available: boolean;
  powered: boolean;
  scanning: boolean;
  adapterAddress: string | null;
  adapterName: string | null;
  selectedDeviceAddress: string | null;
  devices: BluetoothDevice[];
  error: string | null;
}
