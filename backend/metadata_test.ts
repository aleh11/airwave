import { assertEquals } from "@std/assert";
import { parseStreamTitle } from "./metadata.ts";

Deno.test("ICY metadata parser extracts a stream title", () => {
  assertEquals(
    parseStreamTitle("StreamTitle='Thandiswa Mazwai - Nizalwa Ngobani';"),
    "Thandiswa Mazwai - Nizalwa Ngobani",
  );
});

Deno.test("ICY metadata parser ignores empty and unrelated blocks", () => {
  assertEquals(parseStreamTitle("StreamUrl='https://example.com';\0\0"), null);
  assertEquals(parseStreamTitle("StreamTitle='';"), null);
});

Deno.test("ICY metadata parser handles escaped apostrophes", () => {
  assertEquals(parseStreamTitle("StreamTitle='Don''t Stop';"), "Don't Stop");
});
