import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { GameMapPreview } from "../GameMap";

import { useGetEditorAreaTypes } from "@/actions/getEditorAreaTypes";
import { useGetScenarioById } from "@/actions/getScenarioById";
import { useScenarioList } from "@/actions/getScenarios";
import { useCloseSession } from "@/actions/sessions/closeSession";
import { useStartGame } from "@/actions/sessions/startGame";
import { useStartSession } from "@/actions/sessions/startSession";
import { useSocketStore } from "@/integrations/stores/useSocketStore";

interface Props {
	password: string,
	setPassword: (value: string)=> void,
}

export default function CreateSessionForm({ password, setPassword }: Props) {
	const [passwordEnabled, setPasswordEnabled] = useState(false);
	const [selectedScenario, setSelectedScenario] = useState("");
	const [sessionCreatedId, setSessionCreatedId] = useState<string | null>(null);

	const { data: scenarioOptions = [], isLoading: scenariosLoading } = useScenarioList();
	const { data: areaTypes } = useGetEditorAreaTypes();
	const { data: fullScenario } = useGetScenarioById(selectedScenario, { enabled: !!selectedScenario });

	const { userId, sessionReady } = useSocketStore();
	const { mutateAsync: startSession, isPending, error } = useStartSession();
	const { mutate: closeSession, isPending: isClosing } = useCloseSession();
	const { mutateAsync: startGame, isPending: isStartingGame } = useStartGame();
	const navigate = useNavigate();

	const handleStartSession = async () => {
		if (!userId || !selectedScenario) return;
		try {
			const res = await startSession({ userId, scenarioId: selectedScenario });
			setSessionCreatedId(res.sessionId);
		} catch (err) {
			console.error("Start session failed:", err);
		}
	};

	const handleStartGame = async () => {
		if (!sessionCreatedId) return;
		try {
			await startGame(sessionCreatedId);
			navigate({ to: "/session/$sessionId", params: { sessionId: sessionCreatedId } });
		} catch (err) {
			console.error("Failed to start game:", err);
		}
	};

	const handleCloseSession = async () => {
		if (!sessionCreatedId) return;
		try {
			await closeSession(sessionCreatedId);
			setSessionCreatedId(null);
			setSelectedScenario("");
		} catch (err) {
			console.error("Failed to close session:", err);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			<h2 className="text-xl font-bold mb-2">Create Session</h2>

			{sessionCreatedId ? (
				<div className="p-4 border border-green-500 rounded text-green-300 bg-green-900/20">
					<p className="text-sm mb-1">Session created successfully!</p>
					<p className="font-mono text-lg">ID: {sessionCreatedId}</p>

					{sessionReady && sessionReady.sessionId === sessionCreatedId ? (
						<div className="mt-2 border-t border-green-700 pt-2 text-blue-300">
							<p className="text-sm">
								✅ Player <span className="font-mono">{sessionReady.player2}</span> joined the session!
							</p>
							<p className="text-sm">You can now start the game.</p>
							<button
								onClick={handleStartGame}
								className="mt-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-semibold disabled:opacity-50"
								disabled={isStartingGame}
							>
								{isStartingGame ? "Starting..." : "Start Game"}
							</button>
						</div>
					) : (
						<>
							<p className="text-sm mt-2">Waiting for another player to join...</p>
							<div className="mt-4">
								<button
									onClick={handleCloseSession}
									disabled={isClosing}
									className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-semibold disabled:opacity-50"
								>
									{isClosing ? "Closing..." : "Close Session"}
								</button>
							</div>
						</>
					)}
				</div>
			) : (
				<>
					<label className="text-sm">Select Scenario:</label>
					<select
						value={selectedScenario}
						onChange={(e) => setSelectedScenario(e.target.value)}
						className="bg-gray-700 text-white p-2 rounded"
						disabled={scenariosLoading}
					>
						<option value="">-- Select Scenario --</option>
						{scenarioOptions.map((s) => (
							<option key={s.scenarioId} value={s.scenarioId}>
								{s.name}
							</option>
						))}
					</select>

					<label className="text-sm">Preview Map:</label>
					{fullScenario && areaTypes && (
						<GameMapPreview
							scenario={fullScenario}
							areaTypes={areaTypes}
							className="w-full aspect-[4/3] rounded border border-gray-600 overflow-hidden"
						/>
					)}
					<div className="flex items-center gap-2 mt-2">
						<input
							type="checkbox"
							id="password-toggle"
							checked={passwordEnabled}
							onChange={(e) => setPasswordEnabled(e.target.checked)}
							className="accent-green-600"
						/>
						<label htmlFor="password-toggle" className="text-sm select-none">
							Enable password protection
						</label>
					</div>

					{passwordEnabled && (
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Enter a password"
							className="bg-gray-700 text-white p-2 rounded"
						/>
					)}

					{error && <p className="text-sm text-red-500">Failed to start session. Please try again.</p>}

					<button
						className="mt-4 bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-semibold disabled:opacity-50"
						onClick={handleStartSession}
						disabled={isPending || !selectedScenario || !userId}
					>
						{isPending ? "Starting..." : "Start Session"}
					</button>
				</>
			)}
		</div>
	);
}
