import type { RadioDatabase } from "./db.ts";
import type { RadioStateMachine } from "./state.ts";

export class StatePersistence {
  #unsubscribe: () => void;

  constructor(machine: RadioStateMachine, database: RadioDatabase) {
    this.#unsubscribe = machine.subscribe(({ previous, current }) => {
      if (previous.volume !== current.volume) database.setSetting("volume", current.volume);
      if (previous.target !== current.target) database.setSetting("target", current.target);
      if (previous.alarm?.at !== current.alarm?.at || previous.alarm?.stationId !== current.alarm?.stationId) {
        database.setSetting("alarm", current.alarm);
      }
    });
  }

  close(): void {
    this.#unsubscribe();
  }
}
