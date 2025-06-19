import { useQuery } from "@tanstack/react-query";

import { SessionList } from "@/actions/proto/game_session";
import { axiosInstance } from "@/integrations/axios/axiosInstance";

export function useGetSessions() {
	return useQuery({
		queryKey: ["sessions"],
		queryFn: async () => {
			const res = await axiosInstance.get("/session-list", {
				responseType: "arraybuffer",
			});
			const bytes = new Uint8Array(res.data);
			const decoded = SessionList.decode(bytes);

			return decoded.sessions;
		},
	});
}
