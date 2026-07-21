import { assertEquals, assertRejects } from "@std/assert";
import {
  isNewerVersion,
  ReleaseUpdateCoordinator,
  ReleaseVersionChecker,
} from "./version.ts";

Deno.test("version comparison follows semantic version ordering", () => {
  assertEquals(isNewerVersion("0.2.0", "0.1.9"), true);
  assertEquals(isNewerVersion("1.0.0", "0.9.9"), true);
  assertEquals(isNewerVersion("0.1.0", "0.1.0"), false);
  assertEquals(isNewerVersion("0.0.9", "0.1.0"), false);
});

Deno.test("release checker returns the latest GitHub release", async () => {
  const checker = new ReleaseVersionChecker(
    "example/airwave",
    () =>
      Promise.resolve(Response.json({
        tag_name: "v0.2.0",
        html_url: "https://github.com/example/airwave/releases/tag/v0.2.0",
      })),
  );
  assertEquals(await checker.check(), {
    current: "0.1.6",
    latest: "0.2.0",
    updateAvailable: true,
    releaseUrl: "https://github.com/example/airwave/releases/tag/v0.2.0",
  });
});

Deno.test("update coordinator queues and reports an update", async () => {
  const directory = await Deno.makeTempDir();
  const requestPath = `${directory}/update.request`;
  const statusPath = `${directory}/update.status.json`;
  const coordinator = new ReleaseUpdateCoordinator(requestPath, statusPath);
  try {
    assertEquals(await coordinator.request("0.2.0"), {
      state: "requested",
      version: "0.2.0",
      message: "The update has been queued.",
    });
    assertEquals(await Deno.readTextFile(requestPath), "0.2.0\n");
    assertEquals(await coordinator.status(), {
      state: "requested",
      version: "0.2.0",
      message: "The update has been queued.",
    });
    await Deno.writeTextFile(
      statusPath,
      JSON.stringify({
        state: "failed",
        version: "0.2.0",
        message: "The update could not be installed.",
      }),
    );
    assertEquals(await coordinator.status(), {
      state: "failed",
      version: "0.2.0",
      message: "The update could not be installed.",
    });
    await assertRejects(
      () => coordinator.request("not-a-version"),
      Error,
      "requested release version is invalid",
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
