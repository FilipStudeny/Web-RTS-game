import { useMutation } from "@tanstack/react-query";

import { axiosInstance } from "@/integrations/axios/axiosInstance";

export function useStartGame() {
	return useMutation({
		mutationFn: async (sessionId: string) => {
			const res = await axiosInstance.post(
				"/session/start-game",
				{ session_id: sessionId },
				{ headers: { "Content-Type": "application/json" } },
			);

			if (res.status !== 200) {
				throw new Error("Failed to start game");
			}
		},
	});
}
