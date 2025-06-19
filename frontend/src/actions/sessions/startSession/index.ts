import { useMutation } from "@tanstack/react-query";

import { StartSessionRequest, StartSessionResponse } from "@/actions/proto/game_session";
import { axiosInstance } from "@/integrations/axios/axiosInstance";

export function useStartSession() {
	return useMutation({
		mutationFn: async (input: { userId: string, scenarioId: string }) => {
			const payload = StartSessionRequest.encode({
				userId: input.userId,
				scenarioId: input.scenarioId,
			}).finish();

			const res = await axiosInstance.post("/session/start", payload, {
				headers: { "Content-Type": "application/protobuf" },
				responseType: "arraybuffer",
			});

			const bytes = new Uint8Array(res.data);

			return StartSessionResponse.decode(bytes);
		},
	});
}
