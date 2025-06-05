import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { useEffect } from "react";

import Header from "../components/Header";

import type { QueryClient } from "@tanstack/react-query";

import { useSocketStore } from "@/integrations/stores/useSocketStore";

interface MyRouterContext {
	queryClient: QueryClient,
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	component: AppLayout,
	errorComponent: () => (
		<div className="flex flex-col items-center justify-center h-screen text-red-600 text-xl">
			<p className="mb-4">Connection to the server failed.</p>
			<button
				className="bg-red-600 text-white px-4 py-2 rounded"
				onClick={() => window.location.reload()}
			>
				Retry
			</button>
		</div>
	),
});

function AppLayout() {
	const { status, connect, userId } = useSocketStore();

	useEffect(() => {
		connect();
	}, []);

	if (status === "idle" || status === "connecting") {
		return (
			<div className="flex items-center justify-center h-screen text-xl text-gray-700">
				Connecting to server...
			</div>
		);
	}

	if (status === "error") {
		throw new Error("WebSocket connection failed");
	}

	if (!userId) {
		return (
			<div className="flex items-center justify-center h-screen text-xl text-gray-700">
				Awaiting user ID...
			</div>
		);
	}

	return (
		<div className="flex flex-col h-screen">
			<Header />
			<div className="flex-1">
				<Outlet />
			</div>
		</div>
	);
}
