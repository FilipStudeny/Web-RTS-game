import { useQuery } from "@tanstack/react-query";

import { SessionSummary } from "@/actions/proto/game_session";
import { axiosInstance } from "@/integrations/axios/axiosInstance";

export function useGetSessionById(sessionId: string) {
	return useQuery({
		queryKey: ["session", sessionId],
		queryFn: async () => {
			const res = await axiosInstance.get(`/session/${sessionId}`, {
				responseType: "arraybuffer",
			});

			const bytes = new Uint8Array(res.data);
			const decoded = SessionSummary.decode(bytes);

			return decoded;
		},
		enabled: !!sessionId,
	});
}
