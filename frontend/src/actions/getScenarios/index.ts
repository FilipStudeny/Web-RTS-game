import { useQuery } from "@tanstack/react-query";

import { ScenarioList } from "../proto/scenario";

import { axiosInstance } from "@/integrations/axios/axiosInstance";

export function useScenarioList() {
	return useQuery({
		queryKey: ["scenario-list"],
		queryFn: async () => {
			const res = await axiosInstance.get("/scenario-list.pb", {
				headers: {
					Accept: "application/protobuf",
				},
				responseType: "arraybuffer", // Important for protobuf decoding
			});

			const decoded = ScenarioList.decode(new Uint8Array(res.data));

			return decoded.scenarios;
		},
	});
}
