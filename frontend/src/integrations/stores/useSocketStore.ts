// useSocketStore.ts
import { create } from "zustand";

import {
	GameEndedEvent,
	SessionReadyEvent,
	WsServerMessage,
} from "@/actions/proto/game_session";

type Status = "idle" | "connecting" | "connected" | "disconnected" | "error";

interface SocketStore {
	socket: WebSocket | null,
	userId: string | null,
	status: Status,
	sessionReady: SessionReadyEvent | null,
	gameStartedSessionId: string | null,
	gameEnded: GameEndedEvent | null,
	movedUnits: Record<string, { lat: number, lon: number }>,
	connect: ()=> void,
}

export const useSocketStore = create<SocketStore>((set, get) => ({
	socket: null,
	userId: null,
	status: "idle",
	sessionReady: null,
	gameStartedSessionId: null,
	gameEnded: null,
	movedUnits: {},
	connect: () => {
		if (get().socket) return;

		set({ status: "connecting" });

		const ws = new WebSocket("ws://localhost:9999/ws");
		let hasConnected = false;

		ws.binaryType = "arraybuffer";

		ws.onopen = () => {
			hasConnected = true;
			set({ socket: ws, status: "connected" });
		};

		ws.onmessage = (event) => {
			if (typeof event.data === "string") {
				if (!get().userId) set({ userId: event.data });

				return;
			}

			try {
				const msg = WsServerMessage.decode(new Uint8Array(event.data));

				if (msg.sessionReady) {
					set({ sessionReady: msg.sessionReady });
				}

				if (msg.gameStarted) {
					set({ gameStartedSessionId: msg.gameStarted.sessionId });
				}

				if (msg.gameEnded) {
					set({ gameEnded: msg.gameEnded });
				}

				if (msg.unitMoved) {
					const { unitId, targetLat, targetLon } = msg.unitMoved;
					set((state) => ({
						movedUnits: {
							...state.movedUnits,
							[unitId]: { lat: targetLat, lon: targetLon },
						},
					}));
				}
			} catch (err) {
				console.error("Failed to decode WebSocket message:", err);
			}
		};

		ws.onclose = () => {
			console.warn("WebSocket closed");
			set({ socket: null });

			if (!hasConnected) {
				set({ status: "error" });
			} else {
				set({ status: "disconnected" });
				setTimeout(() => get().connect(), 3000);
			}
		};

		ws.onerror = () => {
			set({ status: "error" });
			console.error("WebSocket error");
		};
	},
}));
