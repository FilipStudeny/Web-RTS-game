import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import CreateSessionForm from "@/features/CreateSession";
import SelectedSessionPanel from "@/features/SelectedSessionPanel";

export const Route = createFileRoute("/load-scenario")({
	component: LoadScenarioPage,
});

function LoadScenarioPage() {
	const sessions = [
		{ id: "1", name: "Operation Thunder", ip: "192.168.0.101", scenario: "Desert Assault", players: ["Alpha", "Bravo"] },
		{ id: "2", name: "Red Dawn", ip: "192.168.0.102", scenario: "Arctic Conflict", players: ["Echo", "Foxtrot", "Zulu"] },
		{ id: "3", name: "Steel Strike", ip: "192.168.0.103", scenario: "Urban Siege", players: ["Delta"] },
	];

	const [creating, setCreating] = useState(false);
	const [password, setPassword] = useState("");
	const [selectedSession, setSelectedSession] = useState<typeof sessions[0] | null>(null);

	return (
		<div className="flex w-full h-full text-white bg-gray-900">
			{/* Left: Sessions table */}
			<div className="w-2/3 h-full flex flex-col bg-gray-800 p-4 border-r border-slate-700 overflow-y-auto">
				<h2 className="text-2xl font-bold mb-4">Available Sessions</h2>
				<table className="w-full table-auto text-left border-separate border-spacing-y-2 overflow-y-auto">
					<thead>
						<tr className="text-gray-400 text-sm">
							<th className="px-2">Session</th>
							<th className="px-2">Scenario</th>
							<th className="px-2 text-right">Action</th>
						</tr>
					</thead>
					<tbody>
						{sessions.map((session) => (
							<tr
								key={session.id}
								onClick={() => setSelectedSession(session)}
								className={`bg-gray-700 hover:bg-gray-600 transition rounded cursor-pointer ${
									selectedSession?.id === session.id ? "ring-2 ring-blue-500" : ""
								}`}
							>
								<td className="px-2 py-2">
									<div className="font-semibold">{session.name}</div>
									<div className="text-xs text-gray-400">{session.ip}</div>
								</td>
								<td className="px-2 py-2">{session.scenario}</td>
								<td className="px-2 py-2 text-right">
									<Link
										to="/session/$sessionId"
										params={{ sessionId: session.id }}
										className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm font-semibold"
									>
										Join
									</Link>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{/* Right: Preview or create panel */}
			<div className="w-1/3 h-full flex flex-col bg-gray-800 p-6 overflow-y-auto">
				{selectedSession ? (
					<SelectedSessionPanel session={selectedSession} clearSelection={() => setSelectedSession(null)} />
				) : !creating ? (
					<div className="flex flex-col items-center justify-center h-full">
						<h2 className="text-xl font-bold mb-4">Host a New Session</h2>
						<p className="mb-6 text-center text-gray-300">
							Create your own game session and wait for other players to join.
						</p>
						<button
							className="bg-green-600 hover:bg-green-700 px-5 py-2 rounded font-bold text-lg"
							onClick={() => setCreating(true)}
						>
							Create Session
						</button>
					</div>
				) : (
					<CreateSessionForm
						password={password}
						setPassword={setPassword}
					/>
				)}
			</div>
		</div>
	);
}

