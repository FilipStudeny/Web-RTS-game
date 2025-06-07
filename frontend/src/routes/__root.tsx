import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { useEffect } from "react";

import Header from "../components/Header";

import type { QueryClient } from "@tanstack/react-query";

import { LoadingPageComponent } from "@/features/LoadinPageComponent";
import { useSocketStore } from "@/integrations/stores/useSocketStore";

interface MyRouterContext {
	queryClient: QueryClient,
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	component: AppLayout,
	errorComponent: () => (
		<LoadingPageComponent
			error
			message="Connection to the server failed."
			onRetry={() => window.location.reload()}
		/>
	),
});

function AppLayout() {
	const { status, connect, userId } = useSocketStore();

	useEffect(() => {
		connect();
	}, []);

	if (status === "idle" || status === "connecting") {
		return <LoadingPageComponent message="Connecting to server..." />;
	}

	if (status === "error") {
		throw new Error("WebSocket connection failed");
	}

	if (!userId) {
		return <LoadingPageComponent message="Awaiting user ID..." />;
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
