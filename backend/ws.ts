import { RadioCommandError, RadioStateMachine } from "./state.ts";
import type { RadioCommand, RadioState } from "./types.ts";

interface Client {
  id: string;
  socket: WebSocket;
}

const publicCommands = new Set([
  "play",
  "pause",
  "togglePlayback",
  "setVolume",
  "adjustVolume",
  "setStation",
  "setTarget",
  "setSleepTimer",
  "clearSleepTimer",
  "setAlarm",
  "clearAlarm",
]);

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
      id: clientIdFromRequest(request),
      socket,
    };
    socket.addEventListener("open", () => {
      this.#clients.add(client);
      this.#send(client, { type: "state", state: this.#machine.state });
      this.#sendRole(client);
    });
    socket.addEventListener("message", (event) => this.#onMessage(client, event.data));
    socket.addEventListener("close", () => this.#remove(client));
    socket.addEventListener("error", () => this.#remove(client));
    return response;
  }

  publishState(state: RadioState): void {
    this.#broadcast({ type: "state", state });
  }

  #onMessage(client: Client, data: unknown): void {
    try {
      if (typeof data !== "string") throw new RadioCommandError("Command must be JSON text.");
      const command = JSON.parse(data) as RadioCommand;
      if (!command || typeof command.type !== "string" || !publicCommands.has(command.type)) {
        throw new RadioCommandError("Command is not supported.");
      }
      if ((command.type === "play" || command.type === "togglePlayback") && !this.#machine.state.playing) {
        this.#claimPlayer(client);
      }
      this.#machine.dispatch(command, "websocket");
    } catch (error) {
      this.#send(client, {
        type: "error",
        message: error instanceof Error ? error.message : "Command could not be applied.",
      });
    }
  }

  #claimPlayer(client: Client): void {
    if (this.#machine.state.target !== "browser" || this.#browserPlayerId) return;
    this.#browserPlayerId = client.id;
    this.#broadcastRoles();
  }

  #remove(client: Client): void {
    if (!this.#clients.delete(client)) return;
    if (this.#browserPlayerId === client.id) {
      this.#browserPlayerId = null;
      if (this.#machine.state.target === "browser" && this.#machine.state.playing) {
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

function clientIdFromRequest(request: Request): string {
  const requested = new URL(request.url).searchParams.get("clientId")?.slice(0, 128);
  return requested || crypto.randomUUID();
}

