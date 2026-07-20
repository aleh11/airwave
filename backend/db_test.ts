import { assertEquals, assertExists } from "@std/assert";
import { RadioDatabase } from "./db.ts";

Deno.test("stations persist with favorites and edits", async () => {
  const database = await RadioDatabase.open(":memory:");
  try {
    const created = database.createStation({
      name: "Cape Test Radio",
      url: "https://example.com/cape.mp3",
      tags: ["jazz", "local"],
      favorite: true,
    });
    assertEquals(created.favorite, true);
    assertEquals(created.tags, ["jazz", "local"]);

    const updated = database.updateStation(created.id, {
      ...created,
      name: "Cape Test FM",
      favorite: false,
    });
    assertEquals(updated?.name, "Cape Test FM");
    assertEquals(updated?.favorite, false);
    assertExists(database.getStation(created.id));

    assertEquals(database.deleteStation(created.id), true);
    assertEquals(database.getStation(created.id), null);
  } finally {
    database.close();
  }
});

Deno.test("history produces truthful listening statistics", async () => {
  const database = await RadioDatabase.open(":memory:");
  try {
    const station = database.listStations()[0];
    const historyId = database.beginListening(
      station,
      "2026-07-20T18:00:00.000Z",
    );
    database.updateListeningTitle(historyId, "Artist - Track");
    database.finishListening(historyId, "2026-07-20T18:12:34.000Z", 754);

    const stats = database.getStats();
    assertEquals(stats.totalPlays, 1);
    assertEquals(stats.totalListeningSeconds, 754);
    assertEquals(stats.uniqueStations, 1);
    assertEquals(stats.mostPlayed[0].stationName, station.name);
    assertEquals(stats.recent[0].nowPlaying, "Artist - Track");
  } finally {
    database.close();
  }
});

Deno.test("volume, target, and alarm settings round-trip", async () => {
  const database = await RadioDatabase.open(":memory:");
  try {
    database.setSetting("volume", 44);
    database.setSetting("target", "appliance");
    database.setSetting("alarm", {
      at: "2026-07-21T06:30:00.000Z",
      stationId: 2,
    });
    assertEquals(database.getSettings(), {
      volume: 44,
      target: "appliance",
      alarm: { at: "2026-07-21T06:30:00.000Z", stationId: 2 },
    });
  } finally {
    database.close();
  }
});
