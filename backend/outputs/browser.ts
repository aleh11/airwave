import type { RadioStateMachine } from "../state.ts";
import type { RadioState } from "../types.ts";

export class BrowserOutput {
  #unsubscribe: () => void;

  constructor(
    machine: RadioStateMachine,
    publish: (state: RadioState) => void,
  ) {
    this.#unsubscribe = machine.subscribe(({ current }) => publish(current));
  }

  close(): void {
    this.#unsubscribe();
  }
}
