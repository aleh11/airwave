import { assertEquals, assertThrows } from "@std/assert";
import { buildGpiomonArgs } from "./gpio.ts";

Deno.test("libgpiod 2 uses chip option syntax", () => {
  assertEquals(
    buildGpiomonArgs(
      { major: 2, supportsBias: true },
      "gpiochip4",
      ["17", "27"],
      "pull-up",
    ),
    [
      "--edges=falling",
      "--bias=pull-up",
      "--format=%o",
      "--chip",
      "gpiochip4",
      "17",
      "27",
    ],
  );
});

Deno.test("libgpiod 1 uses positional chip syntax", () => {
  assertEquals(
    buildGpiomonArgs(
      { major: 1, supportsBias: true },
      "gpiochip0",
      ["22"],
      "pull-up",
    ),
    [
      "--falling-edge",
      "--bias=pull-up",
      "--line-buffered",
      "--format=%o",
      "gpiochip0",
      "22",
    ],
  );
});

Deno.test("old libgpiod requires explicit external bias", () => {
  assertThrows(
    () =>
      buildGpiomonArgs(
        { major: 1, supportsBias: false },
        "gpiochip0",
        ["22"],
        "pull-up",
      ),
    Error,
    "cannot request pull-ups",
  );
  assertEquals(
    buildGpiomonArgs(
      { major: 1, supportsBias: false },
      "gpiochip0",
      ["22"],
      "external",
    ),
    [
      "--falling-edge",
      "--line-buffered",
      "--format=%o",
      "gpiochip0",
      "22",
    ],
  );
});
