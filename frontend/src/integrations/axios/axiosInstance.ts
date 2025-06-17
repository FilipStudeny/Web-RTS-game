import axios from "axios";

import { useSocketStore } from "@/integrations/stores/useSocketStore";

export const axiosInstance = axios.create({
	baseURL: "http://localhost:9999/api",
	headers: {
		"Content-Type": "application/octet-stream",
	},
	responseType: "arraybuffer",
});

// Set up request interceptor
axiosInstance.interceptors.request.use((config) => {
	// Get userId without hook
	const userId = useSocketStore.getState().userId;

	if (userId) {
		config.headers["x-user-id"] = userId; // Custom header
	}

	return config;
});
