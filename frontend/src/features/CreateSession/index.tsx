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
import { createAreaStyleFactory } from "@/utils/createAreaStyleFactory";
import { getUnitStyle } from "@/utils/renderEntity";

interface Props {
	password: string,
	setPassword: (value: string)=> void,
}

export default function CreateSessionForm({
	password,
	setPassword,
}: Props) {
	// Refs for map, source
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstance = useRef<Map | null>(null);
	const featureSource = useRef(new VectorSource());

	// State
	const [passwordEnabled, setPasswordEnabled] = useState(false);
	const [selectedScenario, setSelectedScenario] = useState<string>("");

	// Data hooks
	const { data: scenarioOptions, isLoading: scenariosLoading } = useScenarioList();
	const { data: areaTypes } = useGetEditorAreaTypes();
	const { data: fullScenario } = useGetScenarioById(selectedScenario, { enabled: !!selectedScenario });

	// Build area‐style factory
	const getAreaStyle = useRef<ReturnType<typeof createAreaStyleFactory> | null>(null);
	useEffect(() => {
		if (!areaTypes) return;
		const configs = areaTypes.map(a => ({
			type: a.name.toLowerCase(),
			label: a.name,
			color: a.color,
			fill: true,
		}));
		getAreaStyle.current = createAreaStyleFactory(configs);
	}, [areaTypes]);

	// Initialize map & layer
	useEffect(() => {
		if (!mapRef.current || mapInstance.current) return;

		const vectorLayer = new VectorLayer({
			source: featureSource.current,
			style: feature => {
				const t = feature.get("type");

				// 1) Units
				if (t === "unit") {
					return getUnitStyle(
						feature.get("unitIcon"),
						feature.get("side"),
						false,
					);
				}

				// 2) Objectives
				if (t === "objective") {
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

				// 3) Everything else → area (forest, city, etc.)
				return getAreaStyle.current?.(feature, false);
			},
		});

		const map = new Map({
			target: mapRef.current,
			layers: [
				new TileLayer({ source: new OSM() }),
				vectorLayer,
			],
			view: new View({ center: fromLonLat([0, 0]), zoom: 2 }),
			controls: [new ScaleLine({ units: "metric", minWidth: 64 })],
			interactions: [],
		});

		mapInstance.current = map;
	}, []);

	// Draw all features when scenario loads
	useEffect(() => {
		if (!mapInstance.current || !fullScenario || !getAreaStyle.current) return;
		const src = featureSource.current;
		src.clear();

		// Units
		fullScenario.units.forEach(u => {
			if (!u.position) return;
			const coord = fromLonLat([u.position.lon, u.position.lat]);
			const f = new Feature(new Point(coord));
			f.set("type", "unit");
			f.set("side", u.side === UnitSide.ENEMY ? "enemy" : "ally");
			f.set("unitIcon", u.icon);
			src.addFeature(f);
		});

		// Objectives
		fullScenario.objectives.forEach(o => {
			if (!o.position) return;
			const coord = fromLonLat([o.position.lon, o.position.lat]);
			const f = new Feature(new Point(coord));
			f.set("type", "objective");
			f.set("letter", o.letter);

			const stateKey =
        o.state === ProtoObjectiveState.CAPTURING ? "capturing" :
        	o.state === ProtoObjectiveState.CAPTURED ? "captured" :
        		"neutral";
			f.set("state", stateKey);
			src.addFeature(f);
		});

		// Areas
		fullScenario.areas.forEach(area => {
			area.coordinates.forEach(ringData => {
				const coords = ringData.points.map(p => fromLonLat([p.lon, p.lat]));

				// close ring
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

		// fit view
		mapInstance.current.getView().fit(src.getExtent(), { padding: [20, 20, 20, 20] });
	}, [fullScenario, areaTypes]);

	return (
		<div className="flex flex-col gap-4">
			<h2 className="text-xl font-bold mb-2">Create Session</h2>

			<label className="text-sm">Select Scenario:</label>
			<select
				value={selectedScenario}
				onChange={e => setSelectedScenario(e.target.value)}
				className="bg-gray-700 text-white p-2 rounded"
				disabled={scenariosLoading}
			>
				<option value="">-- Select Scenario --</option>
				{scenarioOptions?.map(s => (
					<option key={s.id} value={String(s.id)}>{s.name}</option>
				))}
			</select>

			<label className="text-sm">Preview Map:</label>
			<div
				ref={mapRef}
				className="w-full aspect-[4/3] rounded border border-gray-600 overflow-hidden"
			/>

			<div className="flex items-center gap-2 mt-2">
				<input
					type="checkbox"
					id="password-toggle"
					checked={passwordEnabled}
					onChange={e => setPasswordEnabled(e.target.checked)}
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
					onChange={e => setPassword(e.target.value)}
					placeholder="Enter a password"
					className="bg-gray-700 text-white p-2 rounded"
				/>
			)}

			<button className="mt-4 bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-semibold">
				Start Session
			</button>
		</div>
	);
}
