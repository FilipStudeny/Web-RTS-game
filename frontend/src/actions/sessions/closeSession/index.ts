import { useMutation } from "@tanstack/react-query";

import { axiosInstance } from "@/integrations/axios/axiosInstance";

export function useCloseSession() {
	return useMutation({
		mutationFn: async (sessionId: string) => {
			await axiosInstance.post(`/session/close/${sessionId}`);
		},
	});
}
