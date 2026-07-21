import { assertEquals } from "@std/assert";
import { createApiHandler } from "./api.ts";
import { BluetoothCommandResult, BluetoothManager } from "./bluetooth.ts";
import { RadioDatabase } from "./db.ts";
import { RadioBrowserClient } from "./radiobrowser.ts";
import { createInitialState, RadioStateMachine } from "./state.ts";

const speakerInfo = `Device AA:BB:CC:DD:EE:FF (public)
  Name: Lounge Speaker
  Alias: Lounge Speaker
  Icon: audio-card
  Paired: yes
  Trusted: yes
  Blocked: no
  Connected: yes
  UUID: Audio Sink (0000110b-0000-1000-8000-00805f9b34fb)`;

Deno.test("audio API lists and selects Bluetooth outputs", async () => {
  const database = await RadioDatabase.open(":memory:");
  try {
    const bluetooth = new BluetoothManager({
      runner: (args) => {
        if (args[0] === "show") {
          return Promise.resolve(result(`Controller 00:11:22:33:44:55 airwave
  Name: airwave
  Alias: airwave
  Powered: yes`));
        }
        if (args[0] === "devices") {
          return Promise.resolve(
            result("Device AA:BB:CC:DD:EE:FF Lounge Speaker"),
          );
        }
        if (args[0] === "info") return Promise.resolve(result(speakerInfo));
        return Promise.resolve(result("Operation successful"));
      },
    });
    const handler = createApiHandler(
      database,
      new RadioBrowserClient(),
      new RadioStateMachine(createInitialState()),
      bluetooth,
    );

    const listResponse = await handler(
      new Request("http://localhost/api/audio?audioOnly=true"),
    );
    const listBody = await listResponse.json();
    assertEquals(listResponse.status, 200);
    assertEquals(listBody.devices[0].name, "Lounge Speaker");

    const connectResponse = await handler(
      new Request(
        "http://localhost/api/audio/devices/AA:BB:CC:DD:EE:FF/connect",
        { method: "POST" },
      ),
    );
    const connectBody = await connectResponse.json();
    assertEquals(connectResponse.status, 200);
    assertEquals(
      connectBody.selectedDeviceAddress,
      "AA:BB:CC:DD:EE:FF",
    );
  } finally {
    database.close();
  }
});

Deno.test("audio API validates scan duration", async () => {
  const database = await RadioDatabase.open(":memory:");
  try {
    const handler = createApiHandler(
      database,
      new RadioBrowserClient(),
      new RadioStateMachine(createInitialState()),
      new BluetoothManager({
        runner: () => Promise.resolve(result("")),
      }),
    );
    const response = await handler(
      new Request("http://localhost/api/audio/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds: 60 }),
      }),
    );
    assertEquals(response.status, 400);
    assertEquals(await response.json(), {
      error: "Scan duration must be between 3 and 30.",
    });
  } finally {
    database.close();
  }
});

function result(stdout: string): BluetoothCommandResult {
  return { success: true, code: 0, stdout, stderr: "" };
}
