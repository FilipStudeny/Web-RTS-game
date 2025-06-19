import { useNavigate } from "@tanstack/react-router";
import Feature from "ol/Feature";
import Map from "ol/Map";
import View from "ol/View";
import { ScaleLine } from "ol/control";
import { Point, Polygon } from "ol/geom";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import { fromLonLat } from "ol/proj";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Fill, Text, Circle as CircleStyle } from "ol/style";
import { useEffect, useRef, useState } from "react";

import { useGetEditorAreaTypes } from "@/actions/getEditorAreaTypes";
import { useGetScenarioById } from "@/actions/getScenarioById";
import { useScenarioList } from "@/actions/getScenarios";
import {
	type ObjectiveState,
	OBJECTIVE_STATE_STYLE_MAP,
} from "@/actions/models/ObjectiveState";
import { UnitSide } from "@/actions/proto/create_scenario";
import { ObjectiveState as ProtoObjectiveState } from "@/actions/proto/create_scenario";
import { useStartGame } from "@/actions/sessions/startGame";
import { useStartSession } from "@/actions/sessions/startSession";
import { useSocketStore } from "@/integrations/stores/useSocketStore";
import { createAreaStyleFactory } from "@/utils/createAreaStyleFactory";
import { getUnitStyle } from "@/utils/renderEntity";

interface Props {
	password: string,
	setPassword: (value: string)=> void,
}

export default function CreateSessionForm({ password, setPassword }: Props) {
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstance = useRef<Map | null>(null);
	const featureSource = useRef(new VectorSource());

	const [passwordEnabled, setPasswordEnabled] = useState(false);
	const [selectedScenario, setSelectedScenario] = useState("");
	const [sessionCreatedId, setSessionCreatedId] = useState<string | null>(null);

	const { data: scenarioOptions = [], isLoading: scenariosLoading } = useScenarioList();
	const { data: areaTypes } = useGetEditorAreaTypes();
	const { data: fullScenario } = useGetScenarioById(selectedScenario, { enabled: !!selectedScenario });

	const { userId, sessionReady } = useSocketStore();
	const { mutateAsync: startSession, isPending, error } = useStartSession();
	const navigate = useNavigate();
	const { mutateAsync: startGame, isPending: isStartingGame } = useStartGame();
	const getAreaStyle = useRef<ReturnType<typeof createAreaStyleFactory> | null>(null);

	useEffect(() => {
		if (!areaTypes) return;
		getAreaStyle.current = createAreaStyleFactory(
			areaTypes.map((a) => ({
				type: a.name.toLowerCase(),
				label: a.name,
				color: a.color,
				fill: true,
			})),
		);
	}, [areaTypes]);

	useEffect(() => {
		if (!mapRef.current || mapInstance.current) return;

		const vectorLayer = new VectorLayer({
			source: featureSource.current,
			style: (feature) => {
				const type = feature.get("type");
				if (type === "unit") {
					return getUnitStyle(feature.get("unitIcon"), feature.get("side"), false);
				}

				if (type === "objective") {
					const state = feature.get("state") as ObjectiveState;
					const cfg = OBJECTIVE_STATE_STYLE_MAP[state];

					return new Style({
						image: new CircleStyle({
							radius: 10,
							fill: new Fill({ color: cfg.fill }),
							stroke: new Stroke({ color: cfg.stroke, width: 2 }),
						}),
						text: new Text({
							text: feature.get("letter"),
							font: "12px sans-serif",
							fill: new Fill({ color: cfg.text }),
						}),
					});
				}

				return getAreaStyle.current?.(feature, false);
			},
		});

		const map = new Map({
			target: mapRef.current,
			layers: [new TileLayer({ source: new OSM() }), vectorLayer],
			view: new View({ center: fromLonLat([0, 0]), zoom: 2 }),
			controls: [new ScaleLine({ units: "metric", minWidth: 64 })],
			interactions: [],
		});

		mapInstance.current = map;
	}, []);

	useEffect(() => {
		if (!mapInstance.current || !fullScenario || !getAreaStyle.current) return;
		const src = featureSource.current;
		src.clear();

		fullScenario.units.forEach((u) => {
			if (!u.position) return;
			const f = new Feature(new Point(fromLonLat([u.position.lon, u.position.lat])));
			f.set("type", "unit");
			f.set("side", u.side === UnitSide.ENEMY ? "enemy" : "ally");
			f.set("unitIcon", u.icon);
			src.addFeature(f);
		});

		fullScenario.objectives.forEach((o) => {
			if (!o.position) return;
			const f = new Feature(new Point(fromLonLat([o.position.lon, o.position.lat])));
			f.set("type", "objective");
			f.set("letter", o.letter);
			const stateKey =
				o.state === ProtoObjectiveState.CAPTURING
					? "capturing"
					: o.state === ProtoObjectiveState.CAPTURED
						? "captured"
						: "neutral";
			f.set("state", stateKey);
			src.addFeature(f);
		});

		fullScenario.areas.forEach((area) => {
			area.coordinates.forEach((ring) => {
				const coords = ring.points.map((p) => fromLonLat([p.lon, p.lat]));
				if (coords.length > 1) {
					const [x0, y0] = coords[0];
					const [xN, yN] = coords[coords.length - 1];
					if (x0 !== xN || y0 !== yN) coords.push([x0, y0]);
				}

				const poly = new Feature(new Polygon([coords]));
				poly.set("type", area.type.toLowerCase());
				src.addFeature(poly);
			});
		});

		mapInstance.current.getView().fit(src.getExtent(), { padding: [20, 20, 20, 20] });
	}, [fullScenario, areaTypes]);

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
						<p className="text-sm mt-2">Waiting for another player to join...</p>
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
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
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
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Enter a password"
							className="bg-gray-700 text-white p-2 rounded"
						/>
					)}

					{error && (
						<p className="text-sm text-red-500">Failed to start session. Please try again.</p>
					)}

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
