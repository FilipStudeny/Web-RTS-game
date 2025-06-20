import { useMutation, useQueryClient } from "@tanstack/react-query";

import { axiosInstance } from "@/integrations/axios/axiosInstance";

export function useDisconnectUser() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (userId: string) => {
			await axiosInstance.post(`/session/disconnect/${userId}`);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["sessions"] });
		},
	});
}
