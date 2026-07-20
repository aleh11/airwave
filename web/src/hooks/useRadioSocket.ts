import { useCallback, useEffect, useRef, useState } from "react";
import type { RadioCommand, RadioState } from "../types.ts";

type ClientRole = "player" | "remote";

interface SocketMessage {
  type: "state" | "role" | "error";
  state?: RadioState;
  role?: ClientRole;
  playerConnected?: boolean;
  message?: string;
}

export function useRadioSocket(onError: (message: string) => void) {
  const [state, setState] = useState<RadioState | null>(null);
  const [role, setRole] = useState<ClientRole>("remote");
  const [connected, setConnected] = useState(false);
  const [playerConnected, setPlayerConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const commandQueue = useRef<RadioCommand[]>([]);
  const errorHandler = useRef(onError);
  errorHandler.current = onError;

  useEffect(() => {
    let stopped = false;
    let reconnectTimer: number | undefined;
    let attempt = 0;
    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = socket;
      socket.addEventListener("open", () => {
        attempt = 0;
        setConnected(true);
        for (const command of commandQueue.current.splice(0)) socket.send(JSON.stringify(command));
      });
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data) as SocketMessage;
        if (message.type === "state" && message.state) setState(message.state);
        if (message.type === "role" && message.role) {
          setRole(message.role);
          setPlayerConnected(Boolean(message.playerConnected));
        }
        if (message.type === "error" && message.message) errorHandler.current(message.message);
      });
      socket.addEventListener("close", () => {
        setConnected(false);
        if (stopped) return;
        const delay = Math.min(10_000, 500 * 2 ** attempt++);
        reconnectTimer = window.setTimeout(connect, delay);
      });
      socket.addEventListener("error", () => socket.close());
    };

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, []);

  const send = useCallback((command: RadioCommand) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(command));
    else commandQueue.current.push(command);
  }, []);

  return { state, role, connected, playerConnected, send };
}
