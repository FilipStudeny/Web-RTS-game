import { useMutation } from "@tanstack/react-query";

import { CreateScenarioRequest } from "../proto/scenario";

import { axiosInstance } from "@/integrations/axios/axiosInstance";

export function useCreateScenario() {
	return useMutation({
		mutationFn: async (scenario: CreateScenarioRequest) => {
			const binary = CreateScenarioRequest.encode(scenario).finish();

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
