// src/mutations/useSubmitScenario.ts
import { useMutation } from "@tanstack/react-query";

import { Scenario } from "@/actions/proto/create_scenario";

export function useCreateScenario() {
	return useMutation({
		mutationFn: async (scenario: Scenario) => {
			const binary = Scenario.encode(scenario).finish();

			const res = await fetch("http://localhost:9999/api/scenario.pb", {
				method: "POST",
				headers: {
					"Content-Type": "application/protobuf",
				},
				body: binary,
			});

			if (!res.ok) {
				const text = await res.text();
				throw new Error(`Server error: ${res.status} - ${text}`);
			}

			return await res.text();
		},
	});
}
