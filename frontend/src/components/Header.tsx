import { Link, useNavigate } from "@tanstack/react-router";

import { useDisconnectUser } from "@/actions/sessions/disconnectPlayer";
import { useSocketStore } from "@/integrations/stores/useSocketStore";

export default function Header() {
	const navigate = useNavigate();
	const { userId, sessionReady, gameStartedSessionId } = useSocketStore();
	const { mutateAsync: disconnectUser } = useDisconnectUser();

	const sessionId = sessionReady?.sessionId ?? gameStartedSessionId;

	const handleLeaveSession = async () => {
		if (!userId) return;

		try {
			await disconnectUser(userId);

			useSocketStore.setState({
				sessionReady: null,
				gameStartedSessionId: null,
			});

			navigate({ to: "/" });
		} catch (err) {
			console.error("Failed to disconnect user", err);
		}
	};

	return (
		<header className="h-16 min-h-16 px-4 flex items-center justify-between bg-slate-900 text-slate-100 shadow-md">
			<nav className="flex gap-4 items-center">
				<Link
					to="/"
					className="px-3 py-1 rounded hover:bg-slate-700 transition font-semibold"
				>
					Home
				</Link>
				<Link
					to="/editor"
					className="px-3 py-1 rounded hover:bg-slate-700 transition font-semibold"
				>
					Editor
				</Link>

				{sessionId && (
					<button
						onClick={handleLeaveSession}
						className="px-3 py-1 rounded bg-red-700 hover:bg-red-800 transition font-semibold text-white"
					>
						Leave Session
					</button>
				)}
			</nav>

			<div className="text-sm font-mono bg-slate-800 px-3 py-1 rounded text-slate-300 border border-slate-700">
				ID: {userId}
			</div>
		</header>
	);
}
