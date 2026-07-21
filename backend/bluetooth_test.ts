import { assertEquals, assertRejects } from "@std/assert";
import {
  bluealsaMpvDevice,
  BluetoothCommandResult,
  BluetoothError,
  BluetoothManager,
  parseBluetoothDeviceInfo,
} from "./bluetooth.ts";

const speakerInfo = `Device AA:BB:CC:DD:EE:FF (public)
  Name: Lounge Speaker
  Alias: Lounge Speaker
  Icon: audio-card
  Paired: yes
  Trusted: yes
  Blocked: no
  Connected: yes
  UUID: Audio Sink (0000110b-0000-1000-8000-00805f9b34fb)
  UUID: A/V Remote Control Target (0000110c-0000-1000-8000-00805f9b34fb)`;

const keyboardInfo = `Device 11:22:33:44:55:66 (public)
  Name: Desk Keyboard
  Alias: Desk Keyboard
  Icon: input-keyboard
  Paired: no
  Trusted: no
  Blocked: no
  Connected: no
  UUID: Human Interface Device (00001124-0000-1000-8000-00805f9b34fb)`;

Deno.test("Bluetooth device details identify A2DP outputs", () => {
  assertEquals(
    parseBluetoothDeviceInfo(speakerInfo, {
      address: "AA:BB:CC:DD:EE:FF",
      name: "Unknown",
    }),
    {
      address: "AA:BB:CC:DD:EE:FF",
      name: "Lounge Speaker",
      alias: "Lounge Speaker",
      icon: "audio-card",
      paired: true,
      trusted: true,
      connected: true,
      blocked: false,
      audioCapable: true,
      uuids: [
        "0000110b-0000-1000-8000-00805f9b34fb",
        "0000110c-0000-1000-8000-00805f9b34fb",
      ],
    },
  );
  assertEquals(
    bluealsaMpvDevice("aa:bb:cc:dd:ee:ff"),
    "alsa/bluealsa:DEV=AA:BB:CC:DD:EE:FF,PROFILE=a2dp",
  );
});

Deno.test("Bluetooth manager filters audio devices and persists selection", async () => {
  const commands: string[] = [];
  const selected: Array<string | null> = [];
  const outputs: Array<[string | null, string | null]> = [];
  const manager = new BluetoothManager({
    runner: (args) => {
      commands.push(args.join(" "));
      if (args[0] === "show") {
        return Promise.resolve(result(`Controller 00:11:22:33:44:55 airwave
  Name: airwave
  Alias: airwave
  Powered: yes`));
      }
      if (args[0] === "devices") {
        return Promise.resolve(result(`Device AA:BB:CC:DD:EE:FF Lounge Speaker
Device 11:22:33:44:55:66 Desk Keyboard`));
      }
      if (args[0] === "info" && args[1] === "AA:BB:CC:DD:EE:FF") {
        return Promise.resolve(result(speakerInfo));
      }
      if (args[0] === "info" && args[1] === "11:22:33:44:55:66") {
        return Promise.resolve(result(keyboardInfo));
      }
      return Promise.resolve(result("Operation successful"));
    },
    onSelectedDeviceChange: (address) => selected.push(address),
    onAudioDeviceChange: (address, name) => {
      outputs.push([address, name]);
    },
  });

  const status = await manager.getStatus(true);
  assertEquals(status.available, true);
  assertEquals(status.powered, true);
  assertEquals(status.adapterAddress, "00:11:22:33:44:55");
  assertEquals(status.devices.map((device) => device.name), ["Lounge Speaker"]);

  await manager.connect("aa:bb:cc:dd:ee:ff");
  assertEquals(selected, ["AA:BB:CC:DD:EE:FF"]);
  assertEquals(outputs, [["AA:BB:CC:DD:EE:FF", "Lounge Speaker"]]);

  await manager.disconnect("AA:BB:CC:DD:EE:FF");
  assertEquals(selected, ["AA:BB:CC:DD:EE:FF", null]);
  assertEquals(outputs.at(-1), [null, null]);
  assertEquals(commands.includes("disconnect AA:BB:CC:DD:EE:FF"), true);
});

Deno.test("Bluetooth manager rejects non-audio output selection", async () => {
  const manager = new BluetoothManager({
    runner: (args) => {
      if (args[0] === "info") {
        return Promise.resolve(
          result(keyboardInfo.replace("Paired: no", "Paired: yes")),
        );
      }
      return Promise.resolve(result("Operation successful"));
    },
  });
  await assertRejects(
    () => manager.select("11:22:33:44:55:66"),
    BluetoothError,
    "audio output profile",
  );
});

Deno.test("Bluetooth manager reports a missing controller without throwing", async () => {
  const manager = new BluetoothManager({
    runner: () => Promise.reject(new Error("No such file or directory")),
  });
  assertEquals(await manager.getStatus(), {
    available: false,
    powered: false,
    scanning: false,
    adapterAddress: null,
    adapterName: null,
    selectedDeviceAddress: null,
    devices: [],
    error: "No such file or directory",
  });
});

Deno.test("Bluetooth manager retries transient controller power failures", async () => {
  let powerAttempts = 0;
  const manager = new BluetoothManager({
    powerRetryDelayMs: 0,
    runner: (args) => {
      if (args[0] === "show") {
        return Promise.resolve(result(`Controller 00:11:22:33:44:55 airwave
  Name: airwave
  Alias: airwave
  Powered: ${powerAttempts === 3 ? "yes" : "no"}`));
      }
      if (args[0] === "power") {
        powerAttempts += 1;
        return Promise.resolve(
          result(
            powerAttempts === 3
              ? "Changing power on succeeded"
              : "Failed to set power on: org.bluez.Error.Failed",
          ),
        );
      }
      return Promise.resolve(result(""));
    },
  });

  const status = await manager.scan(3, true);
  assertEquals(powerAttempts, 3);
  assertEquals(status.powered, true);
  const diagnostics = await manager.getDiagnostics();
  assertEquals(diagnostics.lastPower?.state, "success");
  assertEquals(diagnostics.lastPower?.attempts, 3);
  assertEquals(diagnostics.lastScan?.state, "success");
});

Deno.test("Bluetooth manager explains a persistent power failure", async () => {
  let powerAttempts = 0;
  const manager = new BluetoothManager({
    powerRetryDelayMs: 0,
    runner: (args) => {
      if (args[0] === "show") {
        return Promise.resolve(result(`Controller 00:11:22:33:44:55 airwave
  Name: airwave
  Alias: airwave
  Powered: no`));
      }
      if (args[0] === "power") powerAttempts += 1;
      return Promise.resolve(
        result("Failed to set power on: org.bluez.Error.Failed"),
      );
    },
  });

  await assertRejects(
    () => manager.scan(3),
    BluetoothError,
    "could not power on after 3 attempts",
  );
  assertEquals(powerAttempts, 3);
  const diagnostics = await manager.getDiagnostics();
  assertEquals(diagnostics.lastPower?.state, "error");
  assertEquals(diagnostics.lastScan?.state, "error");
  assertEquals(
    diagnostics.lastScan?.error?.includes("could not power on"),
    true,
  );
});

Deno.test("Bluetooth manager captures discovery command failures", async () => {
  const manager = new BluetoothManager({
    runner: (args) => {
      if (args[0] === "show") {
        return Promise.resolve(result(`Controller 00:11:22:33:44:55 airwave
  Name: airwave
  Alias: airwave
  Powered: yes`));
      }
      return Promise.resolve(
        result("Failed to start discovery: org.bluez.Error.InProgress"),
      );
    },
  });

  await assertRejects(
    () => manager.scan(3),
    BluetoothError,
    "Failed to start discovery",
  );
  const diagnostics = await manager.getDiagnostics();
  assertEquals(diagnostics.lastScan?.state, "error");
  assertEquals(
    diagnostics.lastScan?.output,
    "Failed to start discovery: org.bluez.Error.InProgress",
  );
});

function result(
  stdout: string,
  success = true,
): BluetoothCommandResult {
  return { success, code: success ? 0 : 1, stdout, stderr: "" };
}
