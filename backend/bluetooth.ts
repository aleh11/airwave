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

export interface BluetoothCommandResult {
  success: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export type BluetoothCommandRunner = (
  args: string[],
  timeoutMs: number,
) => Promise<BluetoothCommandResult>;

interface BluetoothManagerOptions {
  command?: string;
  selectedDeviceAddress?: string | null;
  runner?: BluetoothCommandRunner;
  onSelectedDeviceChange?: (address: string | null) => void;
  onAudioDeviceChange?: (
    address: string | null,
    name: string | null,
  ) => void | Promise<void>;
}

const audioServiceUuids = new Set([
  "00001108-0000-1000-8000-00805f9b34fb",
  "0000110b-0000-1000-8000-00805f9b34fb",
  "0000111e-0000-1000-8000-00805f9b34fb",
]);

const addressPattern = /^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/i;
const ansiSequencePattern = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  "g",
);

export class BluetoothError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export class BluetoothManager {
  #runner: BluetoothCommandRunner;
  #selectedDeviceAddress: string | null;
  #scanning = false;
  #scanPromise: Promise<BluetoothAudioStatus> | null = null;
  #operationChain = Promise.resolve();
  #onSelectedDeviceChange: (address: string | null) => void;
  #onAudioDeviceChange: (
    address: string | null,
    name: string | null,
  ) => void | Promise<void>;

  constructor(options: BluetoothManagerOptions = {}) {
    this.#runner = options.runner ?? createBluetoothCommandRunner(
      options.command ?? "bluetoothctl",
    );
    this.#selectedDeviceAddress = options.selectedDeviceAddress &&
        isBluetoothAddress(options.selectedDeviceAddress)
      ? normalizeAddress(options.selectedDeviceAddress)
      : null;
    this.#onSelectedDeviceChange = options.onSelectedDeviceChange ?? (() => {});
    this.#onAudioDeviceChange = options.onAudioDeviceChange ?? (() => {});
  }

  async initialize(): Promise<void> {
    if (!this.#selectedDeviceAddress) return;
    const address = this.#selectedDeviceAddress;
    const status = await this.getStatus();
    if (!status.available) return;
    const device = status.devices.find((item) => item.address === address);
    if (!device) return;
    if (!device.paired) {
      await this.#setSelectedDevice(null, null);
      return;
    }
    if (!device.connected) await this.#runAction(["connect", address], 30_000);
    await this.#onAudioDeviceChange(address, device.name);
  }

  async getStatus(audioOnly = false): Promise<BluetoothAudioStatus> {
    let controller: BluetoothCommandResult;
    try {
      controller = await this.#runner(["show"], 5_000);
    } catch (error) {
      return unavailableStatus(
        this.#scanning,
        this.#selectedDeviceAddress,
        error,
      );
    }
    const controllerOutput = cleanOutput(controller.stdout, controller.stderr);
    if (
      !controller.success ||
      /No default controller available/i.test(controllerOutput)
    ) {
      return unavailableStatus(
        this.#scanning,
        this.#selectedDeviceAddress,
        controllerOutput || "No Bluetooth controller is available.",
      );
    }
    const controllerProperties = parseProperties(controllerOutput);
    const powered = controllerProperties.get("Powered") === "yes";
    let devices: BluetoothDevice[] = [];
    if (powered) {
      const listed = await this.#run(["devices"], 5_000);
      const discovered = parseDeviceList(listed.stdout).slice(0, 50);
      devices = await Promise.all(discovered.map(async (item) => {
        const result = await this.#run(["info", item.address], 5_000, true);
        return parseBluetoothDeviceInfo(result.stdout, item);
      }));
      devices = devices
        .filter((device) => !audioOnly || device.audioCapable)
        .sort(compareDevices);
    }
    return {
      available: true,
      powered,
      scanning: this.#scanning,
      adapterAddress: parseControllerAddress(controllerOutput),
      adapterName: controllerProperties.get("Alias") ??
        controllerProperties.get("Name") ?? null,
      selectedDeviceAddress: this.#selectedDeviceAddress,
      devices,
      error: null,
    };
  }

  scan(seconds = 8, audioOnly = false): Promise<BluetoothAudioStatus> {
    if (this.#scanPromise) return this.#scanPromise;
    const duration = Math.min(30, Math.max(3, Math.round(seconds)));
    this.#scanPromise = this.#queue(async () => {
      await this.#runAction(["power", "on"], 10_000);
      this.#scanning = true;
      try {
        await this.#run(
          ["--timeout", String(duration), "scan", "on"],
          (duration + 3) * 1_000,
          true,
        );
      } finally {
        this.#scanning = false;
      }
      return await this.getStatus(audioOnly);
    }).finally(() => {
      this.#scanPromise = null;
    });
    return this.#scanPromise;
  }

  async pair(address: string): Promise<BluetoothAudioStatus> {
    const normalized = requireAddress(address);
    return await this.#queue(async () => {
      await this.#runAction(["power", "on"], 10_000);
      let device: BluetoothDevice | null = null;
      try {
        device = await this.#getDevice(normalized);
      } catch (error) {
        if (!(error instanceof BluetoothError) || error.status !== 404) {
          throw error;
        }
      }
      if (!device?.paired) {
        await this.#runAction(
          [
            "--agent",
            "NoInputNoOutput",
            "--timeout",
            "30",
            "pair",
            normalized,
          ],
          33_000,
        );
      }
      await this.#runAction(["trust", normalized], 10_000);
      return await this.getStatus();
    });
  }

  async connect(address: string): Promise<BluetoothAudioStatus> {
    const normalized = requireAddress(address);
    return await this.#queue(async () => {
      const knownDevice = await this.#getDevice(normalized);
      if (!knownDevice.paired) {
        throw new BluetoothError(409, "Pair this device before connecting it.");
      }
      if (knownDevice.connected && knownDevice.audioCapable) {
        await this.#setSelectedDevice(normalized, knownDevice.name);
        return await this.getStatus();
      }
      await this.#runAction(["connect", normalized], 30_000);
      const device = await this.#getDevice(normalized);
      if (!device.audioCapable) {
        throw new BluetoothError(
          422,
          `${device.name} does not expose a Bluetooth audio output profile.`,
        );
      }
      await this.#setSelectedDevice(normalized, device.name);
      return await this.getStatus();
    });
  }

  async disconnect(address: string): Promise<BluetoothAudioStatus> {
    const normalized = requireAddress(address);
    return await this.#queue(async () => {
      const device = await this.#getDevice(normalized);
      if (device.connected) {
        await this.#runAction(["disconnect", normalized], 15_000);
      }
      if (this.#selectedDeviceAddress === normalized) {
        await this.#setSelectedDevice(null, null);
      }
      return await this.getStatus();
    });
  }

  async forget(address: string): Promise<BluetoothAudioStatus> {
    const normalized = requireAddress(address);
    return await this.#queue(async () => {
      await this.#runAction(["remove", normalized], 15_000);
      if (this.#selectedDeviceAddress === normalized) {
        await this.#setSelectedDevice(null, null);
      }
      return await this.getStatus();
    });
  }

  async select(address: string | null): Promise<BluetoothAudioStatus> {
    if (address === null) {
      await this.#queue(() => this.#setSelectedDevice(null, null));
      return await this.getStatus();
    }
    const normalized = requireAddress(address);
    return await this.#queue(async () => {
      const device = await this.#getDevice(normalized);
      if (!device.paired) {
        throw new BluetoothError(409, "Pair this device before selecting it.");
      }
      if (!device.audioCapable) {
        throw new BluetoothError(
          422,
          `${device.name} does not expose a Bluetooth audio output profile.`,
        );
      }
      if (!device.connected) {
        await this.#runAction(["connect", normalized], 30_000);
      }
      await this.#setSelectedDevice(normalized, device.name);
      return await this.getStatus();
    });
  }

  #queue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.#operationChain.then(operation, operation);
    this.#operationChain = queued.then(() => undefined, () => undefined);
    return queued;
  }

  async #getDevice(address: string): Promise<BluetoothDevice> {
    const result = await this.#run(["info", address], 5_000, true);
    const output = cleanOutput(result.stdout, result.stderr);
    if (!result.success || /Device .* not available/i.test(output)) {
      throw new BluetoothError(404, "Bluetooth device was not found.");
    }
    return parseBluetoothDeviceInfo(result.stdout, {
      address,
      name: address,
    });
  }

  async #setSelectedDevice(
    address: string | null,
    name: string | null,
  ): Promise<void> {
    if (address === this.#selectedDeviceAddress) {
      await this.#onAudioDeviceChange(address, name);
      return;
    }
    this.#selectedDeviceAddress = address;
    this.#onSelectedDeviceChange(address);
    await this.#onAudioDeviceChange(address, name);
  }

  async #run(
    args: string[],
    timeoutMs: number,
    allowFailure = false,
  ): Promise<BluetoothCommandResult> {
    try {
      const result = await this.#runner(args, timeoutMs);
      if (!allowFailure && !result.success) {
        throw new BluetoothError(502, commandError(result));
      }
      return result;
    } catch (error) {
      if (error instanceof BluetoothError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (/not found|No such file/i.test(message)) {
        throw new BluetoothError(503, "Bluetooth support is not installed.");
      }
      throw new BluetoothError(502, `Bluetooth command failed: ${message}`);
    }
  }

  async #runAction(args: string[], timeoutMs: number): Promise<void> {
    const result = await this.#run(args, timeoutMs);
    const output = cleanOutput(result.stdout, result.stderr);
    const failure = output.match(
      /(?:Failed to .*|No default controller available|Device .* not available)/i,
    );
    if (failure) throw new BluetoothError(502, failure[0]);
  }
}

export function createBluetoothCommandRunner(
  command: string,
): BluetoothCommandRunner {
  return async (args, timeoutMs) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const output = await new Deno.Command(command, {
        args,
        stdout: "piped",
        stderr: "piped",
        signal: controller.signal,
      }).output();
      return {
        success: output.success,
        code: output.code,
        stdout: new TextDecoder().decode(output.stdout),
        stderr: new TextDecoder().decode(output.stderr),
      };
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function parseBluetoothDeviceInfo(
  output: string,
  fallback: { address: string; name: string },
): BluetoothDevice {
  const clean = stripAnsi(output);
  const properties = parseProperties(clean);
  const address = normalizeAddress(
    parseDeviceAddress(clean) ?? fallback.address,
  );
  const uuids = [...clean.matchAll(/\(([0-9a-f-]{36})\)/gi)]
    .map((match) => match[1].toLowerCase());
  const icon = properties.get("Icon") ?? null;
  return {
    address,
    name: properties.get("Name") ?? fallback.name,
    alias: properties.get("Alias") ?? properties.get("Name") ?? fallback.name,
    icon,
    paired: properties.get("Paired") === "yes",
    trusted: properties.get("Trusted") === "yes",
    connected: properties.get("Connected") === "yes",
    blocked: properties.get("Blocked") === "yes",
    audioCapable: uuids.some((uuid) => audioServiceUuids.has(uuid)) ||
      Boolean(icon?.startsWith("audio-")),
    uuids,
  };
}

export function isBluetoothAddress(value: string): boolean {
  return addressPattern.test(value);
}

export function bluealsaMpvDevice(address: string): string {
  return `alsa/bluealsa:DEV=${requireAddress(address)},PROFILE=a2dp`;
}

function requireAddress(value: string): string {
  if (!isBluetoothAddress(value)) {
    throw new BluetoothError(400, "Bluetooth device address is invalid.");
  }
  return normalizeAddress(value);
}

function normalizeAddress(address: string): string {
  return address.toUpperCase();
}

function parseDeviceList(
  output: string,
): Array<{ address: string; name: string }> {
  const devices = new Map<string, string>();
  for (const line of stripAnsi(output).split("\n")) {
    const match = line.trim().match(
      /^(?:Device\s+)?([0-9A-F]{2}(?::[0-9A-F]{2}){5})\s+(.+)$/i,
    );
    if (match) devices.set(normalizeAddress(match[1]), match[2].trim());
  }
  return [...devices].map(([address, name]) => ({ address, name }));
}

function parseProperties(output: string): Map<string, string> {
  const properties = new Map<string, string>();
  for (const line of stripAnsi(output).split("\n")) {
    const match = line.trim().match(/^([A-Za-z][A-Za-z ]+):\s*(.+)$/);
    if (match && !properties.has(match[1])) {
      properties.set(match[1], match[2].trim());
    }
  }
  return properties;
}

function parseControllerAddress(output: string): string | null {
  const match = stripAnsi(output).match(
    /Controller\s+([0-9A-F]{2}(?::[0-9A-F]{2}){5})/i,
  );
  return match ? normalizeAddress(match[1]) : null;
}

function parseDeviceAddress(output: string): string | null {
  const match = stripAnsi(output).match(
    /Device\s+([0-9A-F]{2}(?::[0-9A-F]{2}){5})/i,
  );
  return match ? normalizeAddress(match[1]) : null;
}

function compareDevices(a: BluetoothDevice, b: BluetoothDevice): number {
  return Number(b.connected) - Number(a.connected) ||
    Number(b.paired) - Number(a.paired) ||
    Number(b.audioCapable) - Number(a.audioCapable) ||
    a.alias.localeCompare(b.alias);
}

function unavailableStatus(
  scanning: boolean,
  selectedDeviceAddress: string | null,
  error: unknown,
): BluetoothAudioStatus {
  return {
    available: false,
    powered: false,
    scanning,
    adapterAddress: null,
    adapterName: null,
    selectedDeviceAddress,
    devices: [],
    error: error instanceof Error ? error.message : String(error),
  };
}

function commandError(result: BluetoothCommandResult): string {
  return cleanOutput(result.stderr, result.stdout) ||
    `bluetoothctl exited with status ${result.code}.`;
}

function cleanOutput(...values: string[]): string {
  return stripAnsi(values.filter(Boolean).join("\n")).trim();
}

function stripAnsi(value: string): string {
  return value.replace(ansiSequencePattern, "");
}
