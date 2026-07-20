import type { RadioDatabase } from "./db.ts";
import type { RadioStateMachine } from "./state.ts";
import type { Station } from "./types.ts";

export class HistoryRecorder {
  #database: RadioDatabase;
  #historyId: number | null = null;
  #startedAt: Date | null = null;
  #unsubscribe: () => void;

  constructor(machine: RadioStateMachine, database: RadioDatabase) {
    this.#database = database;
    this.#unsubscribe = machine.subscribe(({ previous, current }) => {
      const stationChanged = previous.station?.id !== current.station?.id;
      if (previous.playing && (!current.playing || stationChanged)) {
        this.#finish();
      }
      if (
        current.playing && (!previous.playing || stationChanged) &&
        current.station
      ) {
        this.#start(current.station, current.nowPlaying);
      }
      if (this.#historyId && previous.nowPlaying !== current.nowPlaying) {
        this.#database.updateListeningTitle(
          this.#historyId,
          current.nowPlaying,
        );
      }
    });
  }

  close(): void {
    this.#finish();
    this.#unsubscribe();
  }

  #start(station: Station, title: string | null): void {
    this.#finish();
    this.#startedAt = new Date();
    this.#historyId = this.#database.beginListening(
      station,
      this.#startedAt.toISOString(),
    );
    if (title) this.#database.updateListeningTitle(this.#historyId, title);
  }

  #finish(): void {
    if (!this.#historyId || !this.#startedAt) return;
    const endedAt = new Date();
    const durationSeconds = (endedAt.getTime() - this.#startedAt.getTime()) /
      1000;
    this.#database.finishListening(
      this.#historyId,
      endedAt.toISOString(),
      durationSeconds,
    );
    this.#historyId = null;
    this.#startedAt = null;
  }
}
