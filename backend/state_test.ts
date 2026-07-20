import { assertEquals, assertThrows } from "@std/assert";
import {
  createInitialState,
  RadioCommandError,
  RadioStateMachine,
} from "./state.ts";
import type { Station } from "./types.ts";

const station: Station = {
  id: 7,
  name: "Test Signal",
  url: "https://example.com/radio.mp3",
  favicon: null,
  tags: ["test"],
  country: "ZA",
  codec: "MP3",
  bitrate: 128,
  favorite: true,
};

Deno.test("commands mutate and publish the shared radio state", () => {
  const machine = new RadioStateMachine(createInitialState());
  const revisions: number[] = [];
  machine.subscribe(({ current }) => {
    revisions.push(current.revision);
  });

  machine.dispatch({ type: "setStation", station }, "websocket");
  machine.dispatch({ type: "play" }, "websocket");
  machine.dispatch({ type: "setVolume", volume: 200 }, "websocket");
  machine.dispatch({ type: "setTarget", target: "appliance" }, "websocket");

  assertEquals(machine.state.station, station);
  assertEquals(machine.state.playing, true);
  assertEquals(machine.state.volume, 100);
  assertEquals(machine.state.target, "appliance");
  assertEquals(revisions, [1, 2, 3, 4]);
});

Deno.test("no-op commands do not publish a new revision", () => {
  const machine = new RadioStateMachine(createInitialState());
  let changes = 0;
  machine.subscribe(() => {
    changes++;
  });

  assertEquals(machine.dispatch({ type: "pause" }, "websocket"), false);
  assertEquals(
    machine.dispatch({ type: "setVolume", volume: 72 }, "websocket"),
    false,
  );
  assertEquals(changes, 0);
});

Deno.test("playing without a station is rejected", () => {
  const machine = new RadioStateMachine(createInitialState());
  assertThrows(
    () => machine.dispatch({ type: "play" }, "websocket"),
    RadioCommandError,
    "Choose a station",
  );
});

Deno.test("sleep timer uses the injected clock", () => {
  const now = new Date("2026-07-20T18:00:00.000Z");
  const machine = new RadioStateMachine(createInitialState(), () => now);
  machine.dispatch({ type: "setSleepTimer", minutes: 30 }, "websocket");
  assertEquals(machine.state.sleepTimerEndsAt, "2026-07-20T18:30:00.000Z");
  machine.dispatch({ type: "clearSleepTimer" }, "websocket");
  assertEquals(machine.state.sleepTimerEndsAt, null);
});

Deno.test("alarm must be scheduled in the future", () => {
  const now = new Date("2026-07-20T18:00:00.000Z");
  const machine = new RadioStateMachine(createInitialState(), () => now);
  assertThrows(
    () =>
      machine.dispatch({
        type: "setAlarm",
        alarm: { at: "2026-07-20T17:00:00.000Z", stationId: 1 },
      }, "websocket"),
    RadioCommandError,
    "future",
  );
});
