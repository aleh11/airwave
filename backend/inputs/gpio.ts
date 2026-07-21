import type { RadioStateMachine } from "../state.ts";

type GpioAction = "toggle" | "next" | "volumeUp" | "volumeDown";

export class GpioInput {
  #machine: RadioStateMachine;
  #chip: string;
  #buttons: Map<string, GpioAction>;
  #nextStation: () => void;
  #bias: "pull-up" | "external";
  #process: Deno.ChildProcess | null = null;
  #lastEdge = new Map<string, number>();

  constructor(
    machine: RadioStateMachine,
    chip: string,
    buttons: Record<string, GpioAction>,
    nextStation: () => void,
    bias: "pull-up" | "external" = "pull-up",
  ) {
    this.#machine = machine;
    this.#chip = chip;
    this.#buttons = new Map(Object.entries(buttons));
    this.#nextStation = nextStation;
    this.#bias = bias;
  }

  async start(): Promise<void> {
    if (this.#buttons.size === 0) return;
    const capabilities = await this.#detectCapabilities();
    const offsets = [...this.#buttons.keys()];
    const args = buildGpiomonArgs(
      capabilities,
      this.#chip,
      offsets,
      this.#bias,
    );
    this.#process = new Deno.Command("gpiomon", {
      args,
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    this.#consume(this.#process.stdout).catch((error) => console.error(error));
    const status = await this.#process.status;
    if (!status.success) {
      const error = new TextDecoder().decode(
        await collect(this.#process.stderr),
      );
      throw new Error(error.trim() || `gpiomon exited with ${status.code}.`);
    }
  }

  close(): void {
    if (!this.#process) return;
    try {
      this.#process.kill("SIGTERM");
    } catch {
      void 0;
    }
  }

  async #detectCapabilities(): Promise<{
    major: number;
    supportsBias: boolean;
  }> {
    const [versionOutput, helpOutput] = await Promise.all([
      new Deno.Command("gpiomon", { args: ["--version"] }).output(),
      new Deno.Command("gpiomon", { args: ["--help"] }).output(),
    ]);
    if (!versionOutput.success || !helpOutput.success) {
      throw new Error("gpiomon is not available.");
    }
    const decoder = new TextDecoder();
    const version = decoder.decode(versionOutput.stdout);
    const help = decoder.decode(helpOutput.stdout);
    return {
      major: Number(version.match(/(\d+)\./)?.[1] ?? 1),
      supportsBias: help.includes("--bias"),
    };
  }

  async #consume(stream: ReadableStream<Uint8Array>): Promise<void> {
    for await (const line of readLines(stream)) {
      const offset = line.trim().match(/\d+/)?.[0];
      if (!offset) continue;
      const now = Date.now();
      if (now - (this.#lastEdge.get(offset) ?? 0) < 50) continue;
      this.#lastEdge.set(offset, now);
      try {
        this.#dispatch(this.#buttons.get(offset));
      } catch (error) {
        console.warn(error instanceof Error ? error.message : error);
      }
    }
  }

  #dispatch(action: GpioAction | undefined): void {
    if (action === "toggle") {
      this.#machine.dispatch({ type: "togglePlayback" }, "gpio");
    }
    if (action === "next") this.#nextStation();
    if (action === "volumeUp") {
      this.#machine.dispatch({ type: "adjustVolume", delta: 5 }, "gpio");
    }
    if (action === "volumeDown") {
      this.#machine.dispatch({ type: "adjustVolume", delta: -5 }, "gpio");
    }
  }
}

export function buildGpiomonArgs(
  capabilities: { major: number; supportsBias: boolean },
  chip: string,
  offsets: string[],
  bias: "pull-up" | "external",
): string[] {
  if (bias === "pull-up" && !capabilities.supportsBias) {
    throw new Error(
      "This gpiomon version cannot request pull-ups. Upgrade libgpiod or set AIRWAVE_GPIO_BIAS=external and wire external pull-up resistors.",
    );
  }
  const biasArgs = bias === "pull-up" ? ["--bias=pull-up"] : [];
  return capabilities.major >= 2
    ? [
      "--edges=falling",
      ...biasArgs,
      "--format=%o",
      "--chip",
      chip,
      ...offsets,
    ]
    : [
      "--falling-edge",
      ...biasArgs,
      "--line-buffered",
      "--format=%o",
      chip,
      ...offsets,
    ];
}

async function* readLines(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) yield line;
  }
  buffer += decoder.decode();
  if (buffer) yield buffer;
}

async function collect(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
