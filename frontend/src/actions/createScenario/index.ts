import { useMutation } from "@tanstack/react-query";

import { Scenario } from "@/actions/proto/create_scenario";
import { axiosInstance } from "@/integrations/axios/axiosInstance";

export function useCreateScenario() {
	return useMutation({
		mutationFn: async (scenario: Scenario) => {
			const binary = Scenario.encode(scenario).finish();

			const res = await axiosInstance.post("/scenario.pb", binary, {
				headers: {
					"Content-Type": "application/protobuf",
				},
				responseType: "text",
			});

			return res.data;
		},
	});
}
