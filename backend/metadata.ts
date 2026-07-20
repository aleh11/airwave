import type { RadioStateMachine } from "./state.ts";

export class MetadataSniffer {
  #machine: RadioStateMachine;
  #abortController: AbortController | null = null;
  #activeUrl: string | null = null;
  #unsubscribe: () => void;

  constructor(machine: RadioStateMachine) {
    this.#machine = machine;
    this.#unsubscribe = machine.subscribe(({ previous, current }) => {
      const wasActive = previous.playing && previous.station;
      const isActive = current.playing && current.station;
      if (!isActive) {
        this.#stop();
        this.#machine.dispatch({ type: "setNowPlaying", title: null }, "metadata");
        return;
      }
      if (!wasActive || previous.station?.url !== current.station?.url) {
        this.#start(current.station!.url);
      }
    });
  }

  close(): void {
    this.#stop();
    this.#unsubscribe();
  }

  #start(url: string): void {
    this.#stop();
    this.#activeUrl = url;
    const controller = new AbortController();
    this.#abortController = controller;
    this.#sniff(url, controller.signal).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.warn(`Metadata unavailable for ${url}: ${error instanceof Error ? error.message : error}`);
    });
  }

  #stop(): void {
    this.#abortController?.abort();
    this.#abortController = null;
    this.#activeUrl = null;
  }

  async #sniff(url: string, signal: AbortSignal): Promise<void> {
    const response = await fetch(url, {
      headers: {
        "Icy-MetaData": "1",
        "User-Agent": "RadioDeck/1.0",
      },
      redirect: "follow",
      signal,
    });
    if (!response.ok || !response.body) throw new Error(`Stream returned ${response.status}.`);
    const interval = Number(response.headers.get("icy-metaint"));
    if (!Number.isInteger(interval) || interval <= 0) return;
    const reader = new ExactStreamReader(response.body.getReader());
    while (!signal.aborted) {
      if (!(await reader.readExactly(interval))) break;
      const lengthByte = await reader.readExactly(1);
      if (!lengthByte) break;
      const metadataLength = lengthByte[0] * 16;
      if (metadataLength === 0) continue;
      const metadata = await reader.readExactly(metadataLength);
      if (!metadata) break;
      const title = parseStreamTitle(new TextDecoder("utf-8").decode(metadata));
      if (title && this.#activeUrl === url) {
        this.#machine.dispatch({ type: "setNowPlaying", title }, "metadata");
      }
    }
  }
}

export function parseStreamTitle(metadata: string): string | null {
  const match = metadata.replace(/\0/g, "").match(/StreamTitle='((?:[^']|'')*)';/i);
  const title = match?.[1]?.replace(/''/g, "'").trim();
  return title || null;
}

class ExactStreamReader {
  #reader: ReadableStreamDefaultReader<Uint8Array>;
  #buffer = new Uint8Array();

  constructor(reader: ReadableStreamDefaultReader<Uint8Array>) {
    this.#reader = reader;
  }

  async readExactly(length: number): Promise<Uint8Array | null> {
    while (this.#buffer.length < length) {
      const { done, value } = await this.#reader.read();
      if (done) return null;
      const combined = new Uint8Array(this.#buffer.length + value.length);
      combined.set(this.#buffer);
      combined.set(value, this.#buffer.length);
      this.#buffer = combined;
    }
    const result = this.#buffer.slice(0, length);
    this.#buffer = this.#buffer.slice(length);
    return result;
  }
}

