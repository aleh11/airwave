import type { RadioStateMachine } from "../state.ts";
import type { RadioState } from "../types.ts";

export class MpvOutput {
  #machine: RadioStateMachine;
  #command: string;
  #socketPath: string;
  #process: Deno.ChildProcess | null = null;
  #loadedUrl: string | null = null;
  #writeChain = Promise.resolve();
  #unsubscribe: () => void;

  constructor(machine: RadioStateMachine, command = "mpv", socketPath = "/tmp/radio-deck-mpv.sock") {
    this.#machine = machine;
    this.#command = command;
    this.#socketPath = socketPath;
    this.#unsubscribe = machine.subscribe(({ previous, current }) => {
      if (current.target !== "appliance") {
        if (previous.target === "appliance") {
          this.#enqueue(["set_property", "pause", true]);
          this.#machine.dispatch(
            { type: "setOutputStatus", status: { kind: "idle", message: null } },
            "system",
          );
        }
        return;
      }
      const playbackChanged = previous.target !== current.target ||
        previous.station?.url !== current.station?.url ||
        previous.playing !== current.playing ||
        previous.volume !== current.volume;
      if (!playbackChanged) return;
      this.#sync(current);
    });
  }

  async close(): Promise<void> {
    this.#unsubscribe();
    if (this.#process) {
      try {
        this.#process.kill("SIGTERM");
      } catch {
        void 0;
      }
      await this.#process.status.catch(() => undefined);
    }
  }

  #sync(state: RadioState): void {
    this.#ensureProcess().then(async () => {
      if (state.station && state.station.url !== this.#loadedUrl) {
        this.#loadedUrl = state.station.url;
        await this.#enqueue(["loadfile", state.station.url, "replace"]);
      }
      await this.#enqueue(["set_property", "volume", state.volume]);
      await this.#enqueue(["set_property", "pause", !state.playing]);
      this.#machine.dispatch(
        { type: "setOutputStatus", status: { kind: "ready", message: "Appliance output ready" } },
        "system",
      );
    }).catch((error) => {
      this.#machine.dispatch({
        type: "setOutputStatus",
        status: {
          kind: "error",
          message: error instanceof Error ? error.message : "mpv could not start",
        },
      }, "system");
    });
  }

  async #ensureProcess(): Promise<void> {
    if (this.#process) return;
    try {
      await Deno.remove(this.#socketPath);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    this.#process = new Deno.Command(this.#command, {
      args: [
        "--no-video",
        "--idle=yes",
        "--audio-client-name=Radio Deck",
        `--input-ipc-server=${this.#socketPath}`,
      ],
      stdin: "null",
      stdout: "null",
      stderr: "piped",
    }).spawn();
    this.#process.status.then(async ({ success }) => {
      const process = this.#process;
      this.#process = null;
      this.#loadedUrl = null;
      if (!success && process?.stderr) {
        const message = new TextDecoder().decode(await process.stderr.getReader().read().then((v) => v.value));
        console.warn(message);
      }
    });
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const connection = await Deno.connect({ transport: "unix", path: this.#socketPath });
        connection.close();
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error("mpv IPC socket did not become ready.");
  }

  #enqueue(command: unknown[]): Promise<void> {
    this.#writeChain = this.#writeChain.then(async () => {
      if (!this.#process) return;
      const connection = await Deno.connect({ transport: "unix", path: this.#socketPath });
      try {
        const payload = new TextEncoder().encode(`${JSON.stringify({ command })}\n`);
        await connection.write(payload);
      } finally {
        connection.close();
      }
    });
    return this.#writeChain;
  }
}
