import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";

import Header from "../components/Header";

import type { QueryClient } from "@tanstack/react-query";

interface MyRouterContext {
	queryClient: QueryClient,
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	component: () => (
		<>
			<div className="flex flex-col h-screen">
				<Header />
				<div className="flex-1 overflow-hidden">
					<Outlet />
				</div>
			</div>
		</>
	),
});
