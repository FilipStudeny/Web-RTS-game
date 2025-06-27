import { BinaryReader } from "@bufbuild/protobuf/wire";
import { useMutation } from "@tanstack/react-query";

import { CreateScenarioRequest, CreateScenarioResponse } from "../proto/scenario";

import { axiosInstance } from "@/integrations/axios/axiosInstance";

export function useCreateScenario() {
	return useMutation({
		mutationFn: async (scenario: CreateScenarioRequest) => {
			const binary = CreateScenarioRequest.encode(scenario).finish();

			const res = await axiosInstance.post("/scenario.pb", binary, {
				headers: {
					"Content-Type": "application/protobuf",
				},
				responseType: "arraybuffer",
			});

			const reader = new BinaryReader(new Uint8Array(res.data));

			return CreateScenarioResponse.decode(reader);
		},
	});
}
