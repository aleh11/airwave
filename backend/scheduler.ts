import type { RadioDatabase } from "./db.ts";
import type { RadioStateMachine } from "./state.ts";

export class RadioScheduler {
  #machine: RadioStateMachine;
  #database: RadioDatabase;
  #cancelSleep: (() => void) | null = null;
  #cancelAlarm: (() => void) | null = null;
  #unsubscribe: () => void;

  constructor(machine: RadioStateMachine, database: RadioDatabase) {
    this.#machine = machine;
    this.#database = database;
    this.#unsubscribe = machine.subscribe(({ previous, current }) => {
      if (previous.sleepTimerEndsAt !== current.sleepTimerEndsAt) this.#scheduleSleep();
      if (previous.alarm?.at !== current.alarm?.at) this.#scheduleAlarm();
    });
    this.#scheduleSleep();
    this.#scheduleAlarm();
  }

  close(): void {
    this.#cancelSleep?.();
    this.#cancelAlarm?.();
    this.#unsubscribe();
  }

  #scheduleSleep(): void {
    this.#cancelSleep?.();
    this.#cancelSleep = this.#scheduleAt(this.#machine.state.sleepTimerEndsAt, () => {
      this.#machine.dispatch({ type: "pause" }, "scheduler");
      this.#machine.dispatch({ type: "clearSleepTimer" }, "scheduler");
    });
  }

  #scheduleAlarm(): void {
    this.#cancelAlarm?.();
    const alarm = this.#machine.state.alarm;
    this.#cancelAlarm = this.#scheduleAt(alarm?.at ?? null, () => {
      const currentAlarm = this.#machine.state.alarm;
      if (!currentAlarm) return;
      const station = this.#database.getStation(currentAlarm.stationId);
      if (station) {
        this.#machine.dispatch({ type: "setStation", station }, "scheduler");
        this.#machine.dispatch({ type: "play" }, "scheduler");
      }
      this.#machine.dispatch({ type: "clearAlarm" }, "scheduler");
    });
  }

  #scheduleAt(at: string | null, callback: () => void): (() => void) | null {
    if (!at) return null;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      if (cancelled) return;
      const delay = new Date(at).getTime() - Date.now();
      if (delay <= 0) {
        callback();
        return;
      }
      timeout = setTimeout(tick, Math.min(delay, 2_147_000_000));
    };
    queueMicrotask(tick);
    return () => {
      cancelled = true;
      if (timeout !== null) clearTimeout(timeout);
    };
  }
}
