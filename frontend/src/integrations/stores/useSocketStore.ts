import { create } from "zustand";

import { WsServerMessage } from "@/actions/proto/game_session";

type Status = "idle" | "connecting" | "connected" | "disconnected" | "error";

interface SocketStore {
	socket: WebSocket | null,
	userId: string | null,
	status: Status,
	sessionReady: { sessionId: string, player2: string } | null,
	gameStartedSessionId: string | null,
	connect: ()=> void,
}

export const useSocketStore = create<SocketStore>((set, get) => ({
	socket: null,
	userId: null,
	status: "idle",
	sessionReady: null,
	gameStartedSessionId: null,

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
					const { sessionId, player2 } = msg.sessionReady;
					set({ sessionReady: { sessionId, player2 } });
				}

				if (msg.gameStarted) {
					const { sessionId } = msg.gameStarted;
					set({ gameStartedSessionId: sessionId });
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
