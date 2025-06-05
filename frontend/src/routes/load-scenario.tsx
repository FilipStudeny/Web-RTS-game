import { createFileRoute, Link } from "@tanstack/react-router";
import { Feature } from "ol";
import Map from "ol/Map";
import View from "ol/View";
import ScaleLine from "ol/control/ScaleLine";
import { Polygon } from "ol/geom";
import { Vector as VectorLayer } from "ol/layer";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { Style, Stroke } from "ol/style";
import { useEffect, useRef, useState } from "react";

import { LoadingPageComponent } from "@/features/LoadinPageComponent";

export const Route = createFileRoute("/load-scenario")({
	component: LoadScenarioPage,
	pendingComponent: LoadingPageComponent,

});

function LoadScenarioPage() {
	const sessions = [
		{ id: "1", name: "Operation Thunder", ip: "192.168.0.101", scenario: "Desert Assault", players: ["Alpha", "Bravo"] },
		{ id: "2", name: "Red Dawn", ip: "192.168.0.102", scenario: "Arctic Conflict", players: ["Echo", "Foxtrot", "Zulu"] },
		{ id: "3", name: "Steel Strike", ip: "192.168.0.103", scenario: "Urban Siege", players: ["Delta"] },
	];

	const [creating, setCreating] = useState(false);
	const [scenario, setScenario] = useState("Desert Assault");
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
						scenario={scenario}
						setScenario={setScenario}
						password={password}
						setPassword={setPassword}
					/>
				)}
			</div>
		</div>
	);
}

function CreateSessionForm({
	scenario,
	setScenario,
	password,
	setPassword,
}: {
	scenario: string,
	setScenario: (value: string)=> void,
	password: string,
	setPassword: (value: string)=> void,
}) {
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstance = useRef<Map | null>(null);
	const [passwordEnabled, setPasswordEnabled] = useState(false);

	const scenarioBounds: Record<string, [number, number, number, number]> = {
		"Desert Assault": [-1300000, 1900000, -1100000, 2100000],
		"Arctic Conflict": [2000000, 9500000, 4000000, 10500000],
		"Urban Siege": [1490000, 6890000, 1498000, 6898000],
	};

	useEffect(() => {
		if (!mapRef.current || mapInstance.current) return;

		const view = new View({ center: [0, 0], zoom: 2 });

		const scaleLine = new ScaleLine({ units: "metric", minWidth: 64 });

		mapInstance.current = new Map({
			target: mapRef.current,
			interactions: [],
			controls: [scaleLine],
			layers: [new TileLayer({ source: new OSM() })],
			view,
		});

		mapInstance.current.set("sessionView", view);
	}, []);

	useEffect(() => {
		const extent = scenarioBounds[scenario];
		if (!mapInstance.current || !extent) return;

		const view = mapInstance.current.get("sessionView") as View;
		view.fit(extent, { padding: [20, 20, 20, 20] });

		mapInstance.current
			.getLayers()
			.getArray()
			.filter((layer) => layer.get("name") === "boundary")
			.forEach((layer) => mapInstance.current!.removeLayer(layer));

		const boundaryFeature = new Feature(
			new Polygon([
				[
					[extent[0], extent[1]],
					[extent[0], extent[3]],
					[extent[2], extent[3]],
					[extent[2], extent[1]],
					[extent[0], extent[1]],
				],
			]),
		);

		const boundaryLayer = new VectorLayer({
			source: new VectorSource({ features: [boundaryFeature] }),
			style: new Style({ stroke: new Stroke({ color: "red", width: 2 }) }),
		});
		boundaryLayer.set("name", "boundary");

		mapInstance.current.addLayer(boundaryLayer);
	}, [scenario]);

	return (
		<div className="flex flex-col gap-4">
			<h2 className="text-xl font-bold mb-2">Create Session</h2>

			<label className="text-sm">Select Scenario:</label>
			<select
				value={scenario}
				onChange={(e) => setScenario(e.target.value)}
				className="bg-gray-700 text-white p-2 rounded"
			>
				<option value="Desert Assault">Desert Assault</option>
				<option value="Arctic Conflict">Arctic Conflict</option>
				<option value="Urban Siege">Urban Siege</option>
			</select>

			<label className="text-sm">Preview Map:</label>
			<div ref={mapRef} className="w-full aspect-[4/3] rounded border border-gray-600 overflow-hidden" />

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
				<>
					<label className="text-sm">Password:</label>
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder="Enter a password"
						className="bg-gray-700 text-white p-2 rounded"
					/>
				</>
			)}

			<button className="mt-4 bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-semibold">
				Start Session
			</button>
		</div>
	);
}

function SelectedSessionPanel({
	session,
	clearSelection,
}: {
	session: { id: string, name: string, scenario: string, players: string[] },
	clearSelection: ()=> void,
}) {
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstance = useRef<Map | null>(null);

	const scenarioBounds: Record<string, [number, number, number, number]> = {
		"Desert Assault": [-1300000, 1900000, -1100000, 2100000],
		"Arctic Conflict": [2000000, 9500000, 4000000, 10500000],
		"Urban Siege": [1490000, 6890000, 1498000, 6898000],
	};

	useEffect(() => {
		if (!mapRef.current) return;

		if (mapInstance.current) {
			mapInstance.current.setTarget(undefined);
			mapInstance.current = null;
		}

		const view = new View({ center: [0, 0], zoom: 2 });
		const extent = scenarioBounds[session.scenario];

		const scaleLine = new ScaleLine({ units: "metric", minWidth: 64 });

		mapInstance.current = new Map({
			target: mapRef.current,
			interactions: [],
			controls: [scaleLine],
			layers: [new TileLayer({ source: new OSM() })],
			view,
		});

		if (extent) {
			view.fit(extent, { padding: [20, 20, 20, 20] });

			const boundaryFeature = new Feature(
				new Polygon([
					[
						[extent[0], extent[1]],
						[extent[0], extent[3]],
						[extent[2], extent[3]],
						[extent[2], extent[1]],
						[extent[0], extent[1]],
					],
				]),
			);

			const boundaryLayer = new VectorLayer({
				source: new VectorSource({ features: [boundaryFeature] }),
				style: new Style({
					stroke: new Stroke({ color: "red", width: 2 }),
				}),
			});

			mapInstance.current.addLayer(boundaryLayer);
		}
	}, [session]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-bold">{session.name}</h2>
				<button onClick={clearSelection} className="text-sm text-gray-400 hover:text-white">
					Clear
				</button>
			</div>

			<p className="text-gray-300 text-sm">Scenario: {session.scenario}</p>

			<label className="text-sm">Map Preview:</label>
			<div ref={mapRef} className="w-full aspect-[4/3] rounded border border-gray-600 overflow-hidden" />

			<label className="text-sm">Players in Game:</label>
			<ul className="bg-gray-700 p-2 rounded text-sm">
				{session.players.length ? (
					session.players.map((p) => (
						<li key={p} className="py-1 border-b border-gray-600 last:border-b-0">
							{p}
						</li>
					))
				) : (
					<li className="text-gray-400 italic">No players yet</li>
				)}
			</ul>

			<Link
				to="/session/$sessionId"
				params={{ sessionId: session.id }}
				className="mt-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-semibold text-center"
			>
				Join Session
			</Link>
		</div>
	);
}
