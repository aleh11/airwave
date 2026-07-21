import { assertEquals } from "@std/assert";
import { isNewerVersion, ReleaseVersionChecker } from "./version.ts";

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
    current: "0.1.0",
    latest: "0.2.0",
    updateAvailable: true,
    releaseUrl: "https://github.com/example/airwave/releases/tag/v0.2.0",
  });
});
