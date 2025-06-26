import { useQuery } from "@tanstack/react-query";

import { Scenario } from "../proto/scenario";

import { axiosInstance } from "@/integrations/axios/axiosInstance";

export function useGetScenarioById(id: string, options?: { enabled?: boolean }) {
	return useQuery({
		queryKey: ["scenario", id],
		queryFn: async () => {
			const res = await axiosInstance.get(`/scenario/${id}/pb`, {
				headers: { Accept: "application/protobuf" },
				responseType: "arraybuffer",
			});

			return Scenario.decode(new Uint8Array(res.data));
		},
		enabled: options?.enabled ?? true,
	});
}

