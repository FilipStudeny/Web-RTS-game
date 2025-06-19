import { useMutation } from "@tanstack/react-query";

import { JoinSessionRequest, JoinSessionResponse } from "@/actions/proto/game_session";
import { axiosInstance } from "@/integrations/axios/axiosInstance";

export function useJoinSession() {
	return useMutation({
		mutationFn: async (input: { userId: string, sessionId: string }) => {
			const payload = JoinSessionRequest.encode({
				userId: input.userId,
				sessionId: input.sessionId,
			}).finish();

			const res = await axiosInstance.post("/session/join", payload, {
				headers: { "Content-Type": "application/protobuf" },
				responseType: "arraybuffer",
			});

			const bytes = new Uint8Array(res.data);

			return JoinSessionResponse.decode(bytes);
		},
	});
}
