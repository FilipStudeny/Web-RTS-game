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
import toast from "react-hot-toast";

import { useGetEditorAreaTypes } from "@/actions/getEditorAreaTypes";
import { useGetScenarioById } from "@/actions/getScenarioById";
import {
	OBJECTIVE_STATE_STYLE_MAP,
} from "@/actions/models/ObjectiveState";import { UnitSide } from "@/actions/proto/create_scenario";
import { ObjectiveState as ProtoObjectiveState } from "@/actions/proto/create_scenario";
import { useJoinSession } from "@/actions/sessions/joinSession";
import { useSocketStore } from "@/integrations/stores/useSocketStore";
import { createAreaStyleFactory } from "@/utils/createAreaStyleFactory";
import { getUnitStyle } from "@/utils/renderEntity";

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
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstance = useRef<Map | null>(null);
	const featureSource = useRef(new VectorSource());
	const getAreaStyle = useRef<ReturnType<typeof createAreaStyleFactory> | null>(null);

	const { userId, sessionReady, gameStartedSessionId } = useSocketStore();
	const { mutateAsync: joinSession, isPending } = useJoinSession();
	const navigate = useNavigate();
	const [hasJoined, setHasJoined] = useState(false);

	const { data: fullScenario } = useGetScenarioById(session.scenarioId, {
		enabled: !!session.scenarioId,
	});
	const { data: areaTypes } = useGetEditorAreaTypes();

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
					const state = feature.get("state") as keyof typeof OBJECTIVE_STATE_STYLE_MAP;
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
		if (!mapInstance.current || !fullScenario) return;

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
	}, [fullScenario]);

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
					<div ref={mapRef} className="w-full aspect-[4/3] rounded border border-gray-600 overflow-hidden" />

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
