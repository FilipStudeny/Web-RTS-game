import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Landmark,
	TreeDeciduous,
	ShieldPlus,
	XCircle,
	MousePointerSquareDashed,
} from "lucide-react";
import Map from "ol/Map";
import View from "ol/View";
import { click } from "ol/events/condition";
import { Draw, Select } from "ol/interaction";
import { createBox } from "ol/interaction/Draw";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style, Text } from "ol/style";
import { useEffect, useRef, useState } from "react";

import { UnitTypeList } from "../../../shared/proto/unit_Types";
const useUnitTypes = () => {
	return useQuery({
		queryKey: ["unit-types"],
		queryFn: async () => {
			const res = await fetch("http://localhost:9999/api/unit-types.pb");
			if (!res.ok) throw new Error("Failed to fetch unit types");

			const arrayBuffer = await res.arrayBuffer();
			const bytes = new Uint8Array(arrayBuffer);
			const decoded = UnitTypeList.decode(bytes);

			return decoded.unitTypes;
		},
	});
};

export const Route = createFileRoute("/editor")({
	component: EditorPage,
});

function EditorPage() {
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstance = useRef<null | Map>(null);
	const vectorSourceRef = useRef(new VectorSource());
	const [drawType, setDrawType] = useState<"city" | "forest" | "unit" | null>(null);
	const [selectedFeature, setSelectedFeature] = useState<any>(null);
	const [playableAreaDrawn, setPlayableAreaDrawn] = useState(false);
	const [scenarioName, setScenarioName] = useState("");
	const [error, setError] = useState<string | null>(null);

	const { data: unitTypes, isLoading, errors } = useUnitTypes();

	useEffect(() => {
		if (unitTypes) {
			console.log("Fetched unit types from backend:", unitTypes);
		}
	}, [unitTypes]);

	useEffect(() => {
		if (!mapRef.current || mapInstance.current) return;

		const vectorLayer = new VectorLayer({
			source: vectorSourceRef.current,
			style: (feature) => {
				const type = feature.get("type");
				let fillColor = "rgba(0, 0, 255, 0.1)";
				let strokeColor = "#cbd5e1";
				let textLabel = type?.toUpperCase() || "";

				if (type === "city") {
					fillColor = "rgba(255, 165, 0, 0.3)";
					strokeColor = "#f97316";
				} else if (type === "forest") {
					fillColor = "rgba(34, 139, 34, 0.3)";
					strokeColor = "#22c55e";
				} else if (type === "playable") {
					fillColor = "rgba(0, 0, 0, 0)";
					strokeColor = "#0ea5e9";
					const widthKm = feature.get("widthKm");
					const heightKm = feature.get("heightKm");
					textLabel = `PLAYABLE AREA\n${widthKm} × ${heightKm} km`;
				}

				return new Style({
					stroke: new Stroke({ color: strokeColor, width: 3 }),
					fill: new Fill({ color: fillColor }),
					text: new Text({
						text: textLabel,
						fill: new Fill({ color: "#f8fafc" }),
						stroke: new Stroke({ color: "#1e293b", width: 2 }),
						font: "bold 13px 'Orbitron', sans-serif",
						textAlign: "center",
						textBaseline: "middle",
						overflow: true,
					}),
				});
			},
		});

		const map = new Map({
			target: mapRef.current,
			layers: [
				new TileLayer({ source: new OSM({ attributions: [] }) }),
				vectorLayer,
			],
			view: new View({ center: [0, 0], zoom: 2 }),
			controls: [],
		});

		const select = new Select({ condition: click });
		map.addInteraction(select);
		select.on("select", (e) => {
			setSelectedFeature(e.selected[0] || null);
		});

		mapInstance.current = map;
	}, []);

	useEffect(() => {
		if (!mapInstance.current) return;

		mapInstance.current.getInteractions().forEach((interaction) => {
			if (interaction instanceof Draw) {
				mapInstance.current!.removeInteraction(interaction);
			}
		});

		if (drawType && playableAreaDrawn) {
			const draw = new Draw({
				source: vectorSourceRef.current,
				type: "Polygon",
			});
			draw.on("drawend", (e) => {
				e.feature.set("type", drawType);
			});
			mapInstance.current.addInteraction(draw);
		}
	}, [drawType, playableAreaDrawn]);

	const deleteSelectedFeature = () => {
		if (selectedFeature) {
			const isPlayableArea = selectedFeature.get("type") === "playable";
			vectorSourceRef.current.removeFeature(selectedFeature);
			setSelectedFeature(null);

			if (isPlayableArea) {
				setPlayableAreaDrawn(false);
				setDrawType(null);
			}
		}
	};

	const drawPlayableArea = () => {
		if (!mapInstance.current) return;

		setError(null);

		const draw = new Draw({
			source: vectorSourceRef.current,
			type: "Circle",
			geometryFunction: createBox(),
		});
		mapInstance.current.addInteraction(draw);

		draw.on("drawend", (e) => {
			const geometry = e.feature.getGeometry();
			if (!geometry) return;

			const extent = geometry.getExtent();
			const width = extent[2] - extent[0];
			const height = extent[3] - extent[1];

			if (width < 5000 || height < 5000) {
				vectorSourceRef.current.removeFeature(e.feature);
				setError("Playable area must be at least 5×5 kilometers.");
				mapInstance.current!.removeInteraction(draw);

				return;
			}

			e.feature.set("type", "playable");
			e.feature.set("widthKm", (width / 1000).toFixed(1));
			e.feature.set("heightKm", (height / 1000).toFixed(1));
			setPlayableAreaDrawn(true);
			mapInstance.current!.removeInteraction(draw);
		});
	};

	return (
		<div className="flex flex-1 w-full h-full text-white">
			<div className="w-2/3 h-full border-r border-slate-700">
				<div ref={mapRef} className="w-full h-full" />
			</div>

			<div className="w-1/3 h-full flex flex-col gap-4 p-4 bg-slate-900 shadow-inner overflow-hidden">
				<h2 className="text-2xl font-bold text-center border-b border-slate-700 pb-2">
					Scenario Editor
				</h2>

				<div className="flex flex-col gap-1">
					<label htmlFor="scenario-name" className="text-sm font-semibold text-slate-300">
						Scenario Name
					</label>
					<input
						id="scenario-name"
						type="text"
						value={scenarioName}
						onChange={(e) => setScenarioName(e.target.value)}
						className="bg-slate-800 text-slate-100 px-3 py-2 rounded border border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
						placeholder="Enter scenario name..."
					/>
				</div>

				{!playableAreaDrawn && (
					<>
						<p className="text-sm text-yellow-400 font-semibold text-center">
							Draw the playable area first (min 5×5 km).
						</p>
						<button
							onClick={drawPlayableArea}
							className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded shadow text-sm uppercase"
						>
							<MousePointerSquareDashed className="w-5 h-5" /> Draw Playable Area
						</button>
						{error && (
							<p className="text-xs text-red-500 text-center">{error}</p>
						)}
					</>
				)}

				<button
					onClick={() => setDrawType("city")}
					disabled={!playableAreaDrawn}
					className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded shadow text-sm uppercase disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<Landmark className="w-5 h-5" /> Mark City
				</button>

				<button
					onClick={() => setDrawType("forest")}
					disabled={!playableAreaDrawn}
					className="flex items-center gap-2 bg-green-700 hover:bg-green-800 px-4 py-2 rounded shadow text-sm uppercase disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<TreeDeciduous className="w-5 h-5" /> Mark Forest
				</button>

				<button
					onClick={() => setDrawType("unit")}
					disabled={!playableAreaDrawn}
					className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded shadow text-sm uppercase disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<ShieldPlus className="w-5 h-5" /> Place Unit
				</button>

				<button
					onClick={() => setDrawType(null)}
					disabled={!playableAreaDrawn}
					className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 px-4 py-2 rounded shadow text-sm uppercase disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<MousePointerSquareDashed className="w-5 h-5" /> Cancel Tool
				</button>

				<button
					onClick={deleteSelectedFeature}
					disabled={!selectedFeature}
					className="flex items-center gap-2 bg-red-700 hover:bg-red-800 px-4 py-2 rounded shadow text-sm uppercase disabled:opacity-50"
				>
					<XCircle className="w-5 h-5" /> Delete Selected
				</button>
			</div>
		</div>
	);
}
