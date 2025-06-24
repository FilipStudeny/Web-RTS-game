import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { useGetEditorAreaTypes } from "@/actions/getEditorAreaTypes";
import { useGetScenarioById } from "@/actions/getScenarioById";
import { useJoinSession } from "@/actions/sessions/joinSession";
import { useSocketStore } from "@/integrations/stores/useSocketStore";
import { GameMapPreview } from "../GameMap";

interface Props {
	session: {
		sessionId: string,
		scenarioId: string,
		player1: string,
		player2?: string,
		state: string,
	},
	clearSelection: ()=> void,
}

export default function SelectedSessionPanel({ session, clearSelection }: Props) {
	const { userId, sessionReady, gameStartedSessionId } = useSocketStore();
	const { mutateAsync: joinSession, isPending } = useJoinSession();
	const navigate = useNavigate();
	const [hasJoined, setHasJoined] = useState(false);

	const { data: fullScenario } = useGetScenarioById(session.scenarioId, {
		enabled: !!session.scenarioId,
	});
	const { data: areaTypes } = useGetEditorAreaTypes();

	const handleJoin = async () => {
		if (!userId) return;

		try {
			await joinSession({ sessionId: session.sessionId, userId });
			setHasJoined(true);
		} catch (err: any) {
			console.error("Failed to join session", err);
			toast.error(err.message || "Could not join session.");
		}
	};

	useEffect(() => {
		if (sessionReady?.sessionId === session.sessionId) {
			navigate({ to: "/session/$sessionId", params: { sessionId: session.sessionId } });
		}
	}, [sessionReady, session.sessionId]);

	useEffect(() => {
		if (gameStartedSessionId === session.sessionId) {
			navigate({ to: "/session/$sessionId", params: { sessionId: session.sessionId } });
		}
	}, [gameStartedSessionId, session.sessionId]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-bold">Session {session.sessionId}</h2>
				<button onClick={clearSelection} className="text-sm text-gray-400 hover:text-white">
					Clear
				</button>
			</div>

			{hasJoined ? (
				<div className="p-4 border border-green-500 rounded text-green-300 bg-green-900/20">
					<p className="text-sm mb-1">Successfully joined the session!</p>
					<p className="font-mono text-lg">ID: {session.sessionId}</p>

					{gameStartedSessionId === session.sessionId ? (
						<p className="text-sm text-blue-300 mt-2">🎮 Game is starting...</p>
					) : (
						<p className="text-sm mt-2">Waiting for host to start the game...</p>
					)}
				</div>
			) : (
				<>
					<p className="text-gray-300 text-sm">Scenario: {fullScenario?.name || session.scenarioId}</p>

					<label className="text-sm">Map Preview:</label>
					{fullScenario && areaTypes && (
						<GameMapPreview
							scenario={fullScenario}
							areaTypes={areaTypes}
							className="w-full aspect-[4/3] rounded border border-gray-600 overflow-hidden"
						/>
					)}

					<label className="text-sm">Players in Game:</label>
					<ul className="bg-gray-700 p-2 rounded text-sm">
						{[session.player1, session.player2].filter(Boolean).map((p) => (
							<li key={p} className="py-1 border-b border-gray-600 last:border-b-0">
								{p}
							</li>
						))}
					</ul>
					<button
						onClick={handleJoin}
						disabled={isPending || !userId}
						className="mt-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-semibold text-center disabled:opacity-50"
					>
						{isPending ? "Joining..." : "Join Session"}
					</button>
				</>
			)}
		</div>
	);
}
