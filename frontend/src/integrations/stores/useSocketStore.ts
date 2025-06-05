// src/store/useSocketStore.ts
import { create } from "zustand";

type Status = "idle" | "connecting" | "connected" | "disconnected" | "error";

interface SocketStore {
	socket: WebSocket | null,
	userId: string | null,
	status: Status,
	connect: ()=> void,
}

export const useSocketStore = create<SocketStore>((set, get) => ({
	socket: null,
	userId: null,
	status: "idle",
	connect: () => {
		if (get().socket) return;

		set({ status: "connecting" });

		const ws = new WebSocket("ws://localhost:9999/ws");

		let hasConnected = false;

		ws.onopen = () => {
			hasConnected = true;
			set({ socket: ws, status: "connected" });
		};

		ws.onmessage = (event) => {
			const id = event.data;
			if (!get().userId) {
				set({ userId: id });
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
