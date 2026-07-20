import { RadioCommandError, RadioStateMachine } from "./state.ts";
import type { RadioCommand, RadioState, Station } from "./types.ts";

interface Client {
  id: string;
  socket: WebSocket;
}

export class WebSocketHub {
  #machine: RadioStateMachine;
  #clients = new Set<Client>();
  #browserPlayerId: string | null = null;

  constructor(machine: RadioStateMachine) {
    this.#machine = machine;
  }

  handle(request: Request): Response {
    const { socket, response } = Deno.upgradeWebSocket(request);
    const client: Client = {
      id: crypto.randomUUID(),
      socket,
    };
    socket.addEventListener("open", () => {
      this.#clients.add(client);
      this.#send(client, { type: "state", state: this.#machine.state });
      this.#sendRole(client);
    });
    socket.addEventListener(
      "message",
      (event) => this.#onMessage(client, event.data),
    );
    socket.addEventListener("close", () => this.#remove(client));
    socket.addEventListener("error", () => this.#remove(client));
    return response;
  }

  publishState(state: RadioState): void {
    this.#broadcast({ type: "state", state });
  }

  #onMessage(client: Client, data: unknown): void {
    try {
      if (typeof data !== "string") {
        throw new RadioCommandError("Command must be JSON text.");
      }
      const command = validatePublicCommand(JSON.parse(data));
      if (
        (command.type === "play" || command.type === "togglePlayback") &&
        !this.#machine.state.playing
      ) {
        this.#claimPlayer(client);
      }
      this.#machine.dispatch(command, "websocket");
    } catch (error) {
      this.#send(client, {
        type: "error",
        message: error instanceof Error
          ? error.message
          : "Command could not be applied.",
      });
    }
  }

  #claimPlayer(client: Client): void {
    if (this.#machine.state.target !== "browser" || this.#browserPlayerId) {
      return;
    }
    this.#browserPlayerId = client.id;
    this.#broadcastRoles();
  }

  #remove(client: Client): void {
    if (!this.#clients.delete(client)) return;
    if (this.#browserPlayerId === client.id) {
      this.#browserPlayerId = null;
      if (
        this.#machine.state.target === "browser" && this.#machine.state.playing
      ) {
        this.#machine.dispatch({ type: "pause" }, "system");
      }
      this.#broadcastRoles();
    }
  }

  #broadcastRoles(): void {
    for (const client of this.#clients) this.#sendRole(client);
  }

  #sendRole(client: Client): void {
    this.#send(client, {
      type: "role",
      role: this.#browserPlayerId === client.id ? "player" : "remote",
      playerConnected: this.#browserPlayerId !== null,
    });
  }

  #broadcast(message: unknown): void {
    for (const client of this.#clients) this.#send(client, message);
  }

  #send(client: Client, message: unknown): void {
    if (client.socket.readyState !== WebSocket.OPEN) return;
    try {
      client.socket.send(JSON.stringify(message));
    } catch {
      this.#remove(client);
    }
  }
}

function validatePublicCommand(value: unknown): RadioCommand {
  if (!value || typeof value !== "object") {
    throw new RadioCommandError("Command is invalid.");
  }
  const command = value as Record<string, unknown>;
  switch (command.type) {
    case "play":
    case "pause":
    case "togglePlayback":
    case "clearSleepTimer":
    case "clearAlarm":
      return { type: command.type };
    case "setVolume":
      if (typeof command.volume !== "number") {
        throw new RadioCommandError("Volume is invalid.");
      }
      return { type: "setVolume", volume: command.volume };
    case "adjustVolume":
      if (typeof command.delta !== "number") {
        throw new RadioCommandError("Volume adjustment is invalid.");
      }
      return { type: "adjustVolume", delta: command.delta };
    case "setTarget":
      if (command.target !== "browser" && command.target !== "appliance") {
        throw new RadioCommandError("Playback target is invalid.");
      }
      return { type: "setTarget", target: command.target };
    case "setStation":
      return { type: "setStation", station: validateStation(command.station) };
    case "setSleepTimer":
      if (typeof command.minutes !== "number") {
        throw new RadioCommandError("Sleep timer is invalid.");
      }
      return { type: "setSleepTimer", minutes: command.minutes };
    case "setAlarm": {
      const alarm = command.alarm as Record<string, unknown> | null;
      if (
        !alarm || typeof alarm.at !== "string" ||
        typeof alarm.stationId !== "number"
      ) {
        throw new RadioCommandError("Alarm is invalid.");
      }
      return {
        type: "setAlarm",
        alarm: { at: alarm.at, stationId: alarm.stationId },
      };
    }
    default:
      throw new RadioCommandError("Command is not supported.");
  }
}

function validateStation(value: unknown): Station | null {
  if (value === null) return null;
  if (!value || typeof value !== "object") {
    throw new RadioCommandError("Station is invalid.");
  }
  const station = value as Record<string, unknown>;
  if (
    !Number.isInteger(station.id) || typeof station.id !== "number" ||
    station.id <= 0 ||
    typeof station.name !== "string" || !station.name.trim() ||
    typeof station.url !== "string" || !isHttpUrl(station.url) ||
    !Array.isArray(station.tags)
  ) {
    throw new RadioCommandError("Station is invalid.");
  }
  return {
    id: station.id,
    name: station.name.slice(0, 160),
    url: station.url,
    favicon: typeof station.favicon === "string" ? station.favicon : null,
    tags: station.tags.filter((tag): tag is string => typeof tag === "string")
      .slice(0, 12),
    country: typeof station.country === "string" ? station.country : null,
    codec: typeof station.codec === "string" ? station.codec : null,
    bitrate: typeof station.bitrate === "number" ? station.bitrate : null,
    favorite: Boolean(station.favorite),
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
