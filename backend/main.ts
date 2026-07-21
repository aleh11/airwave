import { serveDir, serveFile } from "@std/http/file-server";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiHandler } from "./api.ts";
import {
  bluealsaMpvDevice,
  BluetoothManager,
  isBluetoothAddress,
} from "./bluetooth.ts";
import { RadioDatabase } from "./db.ts";
import { HistoryRecorder } from "./history.ts";
import { GpioInput } from "./inputs/gpio.ts";
import { MetadataSniffer } from "./metadata.ts";
import { BrowserOutput } from "./outputs/browser.ts";
import { MpvOutput } from "./outputs/mpv.ts";
import { StatePersistence } from "./persistence.ts";
import { RadioBrowserClient } from "./radiobrowser.ts";
import { RadioScheduler } from "./scheduler.ts";
import { createInitialState, RadioStateMachine } from "./state.ts";
import type { PlaybackTarget } from "./types.ts";
import { WebSocketHub } from "./ws.ts";

export async function startAirwave(): Promise<Deno.HttpServer> {
  const host = Deno.env.get("AIRWAVE_HOST") ?? "127.0.0.1";
  const port = Number(Deno.env.get("AIRWAVE_PORT") ?? 8787);
  const dbPath = Deno.env.get("AIRWAVE_DB_PATH") ?? "./data/airwave.db";
  const bundledWebRoot = fileURLToPath(new URL("../web/dist", import.meta.url));
  const webRoot = resolve(Deno.env.get("AIRWAVE_WEB_ROOT") ?? bundledWebRoot);
  const devUrl = Deno.env.get("AIRWAVE_WEB_DEV_URL");
  const database = await RadioDatabase.open(dbPath);
  const settings = database.getSettings();
  const alarm =
    settings.alarm && new Date(settings.alarm.at).getTime() > Date.now()
      ? settings.alarm
      : null;
  if (settings.alarm && !alarm) database.setSetting("alarm", null);
  const machine = new RadioStateMachine(createInitialState({
    volume: validVolume(settings.volume) ? settings.volume : 72,
    target: validTarget(settings.target) ? settings.target : "browser",
    alarm,
  }));
  const hub = new WebSocketHub(machine);
  const browserOutput = new BrowserOutput(
    machine,
    (state) => hub.publishState(state),
  );
  const history = new HistoryRecorder(machine, database);
  const persistence = new StatePersistence(machine, database);
  const metadata = new MetadataSniffer(machine);
  const scheduler = new RadioScheduler(machine, database);
  const mpv = new MpvOutput(
    machine,
    Deno.env.get("AIRWAVE_MPV_COMMAND") ?? "mpv",
    Deno.env.get("AIRWAVE_MPV_SOCKET") ?? "/tmp/airwave-mpv.sock",
  );
  const selectedAudioDevice = typeof settings.audioDeviceAddress === "string" &&
      isBluetoothAddress(settings.audioDeviceAddress)
    ? settings.audioDeviceAddress.toUpperCase()
    : null;
  if (selectedAudioDevice) {
    await mpv.setAudioDevice(bluealsaMpvDevice(selectedAudioDevice));
  }
  const bluetooth = new BluetoothManager({
    command: Deno.env.get("AIRWAVE_BLUETOOTHCTL_COMMAND") ?? "bluetoothctl",
    selectedDeviceAddress: selectedAudioDevice,
    onSelectedDeviceChange: (address) =>
      database.setSetting("audioDeviceAddress", address),
    onAudioDeviceChange: (address, name) =>
      mpv.setAudioDevice(
        address ? bluealsaMpvDevice(address) : null,
        name,
      ),
  });
  bluetooth.initialize().catch((error) =>
    console.error(`Bluetooth audio unavailable: ${error.message}`)
  );
  const gpio = createGpioInput(machine, database);
  gpio?.start().catch((error) =>
    console.error(`GPIO disabled: ${error.message}`)
  );
  const api = createApiHandler(
    database,
    new RadioBrowserClient(),
    machine,
    bluetooth,
  );

  const close = async () => {
    gpio?.close();
    scheduler.close();
    metadata.close();
    history.close();
    persistence.close();
    browserOutput.close();
    await mpv.close();
    database.close();
  };

  const server = Deno.serve({
    hostname: host,
    port,
    onListen: ({ hostname, port }) =>
      console.log(`Airwave listening on http://${hostname}:${port}`),
  }, async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/ws") return hub.handle(request);
    if (url.pathname.startsWith("/api/")) return await api(request);
    if (devUrl) return await proxyToVite(request, devUrl);
    return await serveFrontend(request, webRoot);
  });

  const shutdown = async () => {
    await server.shutdown();
    await close();
  };
  Deno.addSignalListener("SIGINT", shutdown);
  Deno.addSignalListener("SIGTERM", shutdown);
  return server;
}

function createGpioInput(
  machine: RadioStateMachine,
  database: RadioDatabase,
): GpioInput | null {
  const chip = Deno.env.get("AIRWAVE_GPIO_CHIP");
  if (!chip) return null;
  let buttons: Record<string, "toggle" | "next" | "volumeUp" | "volumeDown">;
  try {
    buttons = JSON.parse(
      Deno.env.get("AIRWAVE_GPIO_BUTTONS") ??
        '{"17":"toggle","27":"next","22":"volumeUp","23":"volumeDown"}',
    );
  } catch {
    throw new Error("AIRWAVE_GPIO_BUTTONS must be a JSON object.");
  }
  const bias = Deno.env.get("AIRWAVE_GPIO_BIAS") ?? "pull-up";
  if (bias !== "pull-up" && bias !== "external") {
    throw new Error("AIRWAVE_GPIO_BIAS must be pull-up or external.");
  }
  return new GpioInput(machine, chip, buttons, () => {
    const favorites = database.listStations().filter((station) =>
      station.favorite
    );
    if (favorites.length === 0) return;
    const currentIndex = favorites.findIndex((station) =>
      station.id === machine.state.station?.id
    );
    const station = favorites[(currentIndex + 1) % favorites.length];
    machine.dispatch({ type: "setStation", station }, "gpio");
    machine.dispatch({ type: "play" }, "gpio");
  }, bias);
}

async function serveFrontend(
  request: Request,
  webRoot: string,
): Promise<Response> {
  const response = await serveDir(request, { fsRoot: webRoot, quiet: true });
  if (response.status !== 404) return response;
  try {
    const index = await serveFile(request, resolve(webRoot, "index.html"));
    if (index.status !== 404) return index;
  } catch {
    void 0;
  }
  return Response.json({
    error: "Frontend build not found. Run `deno task build` first.",
  }, { status: 503 });
}

async function proxyToVite(request: Request, base: string): Promise<Response> {
  const source = new URL(request.url);
  const target = new URL(`${source.pathname}${source.search}`, base);
  const headers = new Headers(request.headers);
  headers.delete("host");
  return await fetch(target, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
  });
}

function validVolume(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 &&
    value <= 100;
}

function validTarget(
  value: PlaybackTarget | undefined,
): value is PlaybackTarget {
  return value === "browser" || value === "appliance";
}

if (import.meta.main) await startAirwave();
