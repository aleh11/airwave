import type {
  CommandSource,
  RadioCommand,
  RadioState,
  StateChange,
} from "./types.ts";

export class RadioCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RadioCommandError";
  }
}

type StateListener = (change: StateChange) => void | Promise<void>;

export class RadioStateMachine {
  #state: RadioState;
  #listeners = new Set<StateListener>();
  #now: () => Date;

  constructor(initial: RadioState, now: () => Date = () => new Date()) {
    this.#state = structuredClone(initial);
    this.#now = now;
  }

  get state(): RadioState {
    return structuredClone(this.#state);
  }

  subscribe(listener: StateListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispatch(command: RadioCommand, source: CommandSource): boolean {
    const previous = this.state;
    const next = this.#reduce(previous, command);
    if (next === previous) return false;
    next.revision = previous.revision + 1;
    this.#state = next;
    const change = { previous, current: this.state, command, source };
    for (const listener of this.#listeners) {
      Promise.resolve(listener(change)).catch((error) => console.error(error));
    }
    return true;
  }

  #reduce(state: RadioState, command: RadioCommand): RadioState {
    switch (command.type) {
      case "play":
        if (!state.station) throw new RadioCommandError("Choose a station before playing.");
        return state.playing ? state : { ...state, playing: true };
      case "pause":
        return state.playing ? { ...state, playing: false } : state;
      case "togglePlayback":
        if (!state.station) throw new RadioCommandError("Choose a station before playing.");
        return { ...state, playing: !state.playing };
      case "setVolume": {
        const volume = normalizeVolume(command.volume);
        return volume === state.volume ? state : { ...state, volume };
      }
      case "adjustVolume": {
        const volume = normalizeVolume(state.volume + command.delta);
        return volume === state.volume ? state : { ...state, volume };
      }
      case "setStation":
        if (sameStation(command.station, state.station)) return state;
        return { ...state, station: command.station, nowPlaying: null };
      case "setTarget":
        if (command.target !== "browser" && command.target !== "appliance") {
          throw new RadioCommandError("Playback target is invalid.");
        }
        return command.target === state.target ? state : { ...state, target: command.target };
      case "setNowPlaying": {
        const title = command.title?.trim() || null;
        return title === state.nowPlaying ? state : { ...state, nowPlaying: title };
      }
      case "setSleepTimer": {
        if (!Number.isFinite(command.minutes) || command.minutes <= 0 || command.minutes > 1440) {
          throw new RadioCommandError("Sleep timer must be between 1 minute and 24 hours.");
        }
        const sleepTimerEndsAt = new Date(this.#now().getTime() + command.minutes * 60_000)
          .toISOString();
        return { ...state, sleepTimerEndsAt };
      }
      case "clearSleepTimer":
        return state.sleepTimerEndsAt ? { ...state, sleepTimerEndsAt: null } : state;
      case "setAlarm": {
        const at = new Date(command.alarm.at);
        if (!Number.isFinite(at.getTime()) || at.getTime() <= this.#now().getTime()) {
          throw new RadioCommandError("Alarm time must be in the future.");
        }
        if (!Number.isInteger(command.alarm.stationId) || command.alarm.stationId <= 0) {
          throw new RadioCommandError("Choose a station for the alarm.");
        }
        return { ...state, alarm: { at: at.toISOString(), stationId: command.alarm.stationId } };
      }
      case "clearAlarm":
        return state.alarm ? { ...state, alarm: null } : state;
      case "setOutputStatus":
        return outputStatusesMatch(command.status, state.outputStatus)
          ? state
          : { ...state, outputStatus: command.status };
    }
  }
}

export function createInitialState(
  overrides: Partial<RadioState> = {},
): RadioState {
  return {
    station: null,
    volume: 72,
    playing: false,
    target: "browser",
    nowPlaying: null,
    sleepTimerEndsAt: null,
    alarm: null,
    outputStatus: { kind: "idle", message: null },
    revision: 0,
    ...overrides,
  };
}

function normalizeVolume(value: number): number {
  if (!Number.isFinite(value)) throw new RadioCommandError("Volume must be a number.");
  return Math.round(Math.max(0, Math.min(100, value)));
}

function sameStation(a: RadioState["station"], b: RadioState["station"]): boolean {
  if (a === null || b === null) return a === b;
  return a.id === b.id && a.url === b.url;
}

function outputStatusesMatch(a: RadioState["outputStatus"], b: RadioState["outputStatus"]): boolean {
  return a.kind === b.kind && a.message === b.message;
}

