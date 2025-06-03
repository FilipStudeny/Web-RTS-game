import { createFileRoute, useParams } from "@tanstack/react-router";
import { Hammer, Package, Users, X, Ruler } from "lucide-react";
import Map from "ol/Map";
import View from "ol/View";
import { click } from "ol/events/condition";
import { LineString } from "ol/geom";
import { Select } from "ol/interaction";
import { Draw } from "ol/interaction";
import { Vector as VectorLayer } from "ol/layer";
import TileLayer from "ol/layer/Tile";
import { fromLonLat } from "ol/proj";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { getLength } from "ol/sphere";
import { Style, Stroke, Text, Fill } from "ol/style";
import { useEffect, useRef, useState } from "react";

import { renderEntityFeatures, type Entity } from "@/utils/renderEntity";

export const Route = createFileRoute("/session/$sessionId")({
	component: RouteComponent,
});

type Unit = {
	id: string,
	name: string,
	health: number,
	accuracy: number,
	sightRange: number,
	movementSpeed: number,
	position: [number, number],
	type: string,
	side: "friendly" | "enemy",
};

type PanelProps = {
	title?: string,
	children: React.ReactNode,
	className?: string,
	onClose?: ()=> void,
	noClose?: boolean,
};

function Panel({ title, children, className = "", onClose, noClose }: PanelProps) {
	return (
		<div
			className={`
        bg-gray-800/75 backdrop-blur-md
        border border-gray-700
        rounded-2xl shadow-md
        p-3 space-y-2
        text-xs text-slate-200
        transition-all duration-300
        ${className}
      `}
		>
			{(title || (onClose && !noClose)) && (
				<div className="flex justify-between items-center mb-1">
					{title && <h2 className="text-sm font-medium text-white">{title}</h2>}
					{onClose && !noClose && (
						<button
							onClick={onClose}
							className="text-gray-400 hover:text-red-400 transition"
							aria-label="Close panel"
						>
							<X size={14} />
						</button>
					)}
				</div>
			)}
			<div className="overflow-auto max-h-full">{children}</div>
		</div>
	);
}

function RouteComponent() {
	const { sessionId } = useParams({ strict: false }) as { sessionId: string };
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstance = useRef<Map | null>(null);
	const vectorSourceRef = useRef(new VectorSource());
	const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
	const [chatMessages, setChatMessages] = useState<string[]>([]);
	const [chatInput, setChatInput] = useState("");
	const [chatOpen, setChatOpen] = useState(false);
	const [unread, setUnread] = useState(false);

	// —— Measurement state ——
	const [showMeasurePanel, setShowMeasurePanel] = useState(false);
	const [measureActive, setMeasureActive] = useState(false);
	const [measuredDistance, setMeasuredDistance] = useState<number | null>(null);
	const measureLayerRef = useRef<VectorLayer<any> | null>(null);
	const measureSourceRef = useRef<VectorSource>(new VectorSource());
	const drawInteractionRef = useRef<Draw | null>(null);

	const [units] = useState<Unit[]>([
		{
			id: "alpha",
			name: "Alpha",
			health: 100,
			accuracy: 80,
			sightRange: 300,
			movementSpeed: 30,
			position: [0, 0],
			type: "infantry",
			side: "friendly",
		},
		{
			id: "bravo",
			name: "Bravo",
			health: 75,
			accuracy: 65,
			sightRange: 200,
			movementSpeed: 20,
			position: [5, 0],
			type: "armour",
			side: "enemy",
		},
	]);

	const unitCount = units.length;
	const unitsInBuild = 2;
	const supplies = 300;

	// ——————————————————————————————————————————
	// Initialize map, entity layer, select interactions, and measurement layer.
	// ——————————————————————————————————————————
	useEffect(() => {
		if (!mapRef.current || mapInstance.current) return;

		// 1) Render unit features
		const features = units.flatMap((unit) =>
			renderEntityFeatures({
				id: unit.id,
				name: unit.name,
				type: unit.type as Entity["type"],
				side: unit.side,
				health: unit.health,
				lon: unit.position[0],
				lat: unit.position[1],
				active: unit.health > 0,
				sightRange: unit.sightRange,
			}),
		);

		// 2) Base OSM layer + vector layer for units
		const vectorLayer = new VectorLayer({ source: vectorSourceRef.current });
		vectorSourceRef.current.clear();
		vectorSourceRef.current.addFeatures(features);

		// 3) Measurement layer & style
		measureLayerRef.current = new VectorLayer({
			source: measureSourceRef.current,
			style: (feature) => {
				const geometry = feature.getGeometry() as LineString;

				return new Style({
					stroke: new Stroke({
						color: "#fbbf24", // amber-400
						width: 2,
					}),
					text: new Text({
						font: "12px sans-serif",
						fill: new Fill({ color: "#ffffff" }),
						stroke: new Stroke({ color: "#000000", width: 2 }),
						text: formatLength(geometry),
						offsetY: -10,
					}),
				});
			},
		});

		// 4) Create the map
		const map = new Map({
			target: mapRef.current,
			layers: [
				new TileLayer({ source: new OSM({ attributions: [] }) }),
				vectorLayer,
				measureLayerRef.current,
			],
			view: new View({
				center: fromLonLat([0, 0]),
				zoom: 3,
				minResolution: 0.5,
			}),
			controls: [],
		});

		// 5a) Select interaction for units
		const selectUnits = new Select({
			condition: click,
			style: null,
			layers: [vectorLayer],
		});
		map.addInteraction(selectUnits);
		selectUnits.on("select", (e) => {
			const unit = e.selected[0]?.get("unitData");
			setSelectedUnit(unit ?? null);
		});

		// 5b) Select interaction for measurement deletion
		const selectMeasure = new Select({
			condition: click,
			style: null,
			layers: [measureLayerRef.current!],
		});
		map.addInteraction(selectMeasure);
		selectMeasure.on("select", (e) => {
			e.selected.forEach((feat) => {
				measureSourceRef.current.removeFeature(feat);
			});
			setMeasuredDistance(null);
			selectMeasure.getFeatures().clear();
		});

		mapInstance.current = map;
	}, [units]);

	// ——————————————————————————————————————————
	// Add/remove the Draw interaction when measureActive changes
	// ——————————————————————————————————————————
	useEffect(() => {
		const map = mapInstance.current;
		if (!map) return;

		// Remove any existing Draw interaction
		if (drawInteractionRef.current) {
			map.removeInteraction(drawInteractionRef.current);
			drawInteractionRef.current = null;
		}

		if (measureActive) {
			// 1) Create a new Draw interaction for LineString
			const draw = new Draw({
				source: measureSourceRef.current,
				type: "LineString",
				maxPoints: 2,
				style: new Style({
					stroke: new Stroke({
						color: "#fbbf24",
						width: 2,
					}),
				}),
			});

			map.addInteraction(draw);
			drawInteractionRef.current = draw;

			// 2) When drawing finishes, compute length, store it, and exit measure mode
			draw.on("drawend", (evt) => {
				const feature = evt.feature;
				const geom = feature.getGeometry() as LineString;
				const lengthMeters = getLength(geom, {
					projection: map.getView().getProjection(),
				});
				setMeasuredDistance(lengthMeters);
				setMeasureActive(false);
			});
		}
	}, [measureActive]);

	// ——————————————————————————————————————————
	// Keyboard handling for chat (same as before)
	// ——————————————————————————————————————————
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				setChatOpen((prev) => {
					if (!prev) setUnread(false);

					return !prev;
				});
			}
		};

		window.addEventListener("keydown", handleKeyDown);

		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	const sendChat = () => {
		if (chatInput.trim()) {
			setChatMessages((prev) => [...prev, `You: ${chatInput}`]);
			setChatInput("");
			if (!chatOpen) setUnread(true);
		}
	};

	// ——————————————————————————————————————————
	// Helper to format a LineString’s length in meters or kilometers
	// ——————————————————————————————————————————
	function formatLength(line: LineString) {
		const length = getLength(line, {
			projection: mapInstance.current!.getView().getProjection(),
		});
		if (length > 1000) {
			return (length / 1000).toFixed(2) + " km";
		} else {
			return Math.round(length) + " m";
		}
	}

	return (
		<div className="flex flex-1 w-full h-full text-white font-sans">
			<div className="flex-1 relative">
				<div ref={mapRef} className="absolute inset-0 z-0" />

				{selectedUnit && (
					<Panel title="Unit Info" className="absolute top-4 left-4 w-64">
						<div className="flex flex-col items-center space-y-2">
							<img
								src={`/images/units/${selectedUnit.type}.png`}
								alt={selectedUnit.type}
								className="w-12 h-12 object-contain rounded-full border border-gray-600"
							/>
							<table className="w-full text-xs text-left">
								<tbody>
									<tr>
										<td className="font-medium pr-1">Name:</td>
										<td>{selectedUnit.name}</td>
									</tr>
									<tr>
										<td className="font-medium pr-1">Health:</td>
										<td>{selectedUnit.health}</td>
									</tr>
									<tr>
										<td className="font-medium pr-1">Accuracy:</td>
										<td>{selectedUnit.accuracy}%</td>
									</tr>
									<tr>
										<td className="font-medium pr-1">Sight:</td>
										<td>{selectedUnit.sightRange} m</td>
									</tr>
									<tr>
										<td className="font-medium pr-1">Speed:</td>
										<td>{selectedUnit.movementSpeed} km/h</td>
									</tr>
								</tbody>
							</table>
						</div>
					</Panel>
				)}

				<Panel title="Status Overview" className="absolute bottom-4 left-4 w-64">
					<div className="space-y-2">
						<p className="flex items-center gap-1 text-xs">
							<Users size={14} className="text-emerald-400" />
							<span className="font-medium">Units:</span> {unitCount}
						</p>
						<p className="flex items-center gap-1 text-xs">
							<Hammer size={14} className="text-orange-400" />
							<span className="font-medium">Building:</span> {unitsInBuild}
						</p>
						<p className="flex items-center gap-1 text-xs">
							<Package size={14} className="text-sky-400" />
							<span className="font-medium">Supplies:</span> {supplies}
						</p>
					</div>
				</Panel>

				{!showMeasurePanel && (
					<button
						onClick={() => setShowMeasurePanel(true)}
						className="
              absolute top-4 right-4
              w-8 h-8
              bg-gray-800/50 hover:bg-gray-800/75
              rounded-full
              flex items-center justify-center
              text-gray-200 hover:text-white
              transition
            "
						title="Open measurement tool"
					>
						<Ruler size={18} />
					</button>
				)}

				{showMeasurePanel && (
					<Panel title="Measure" className="absolute top-4 right-4 w-48" onClose={() => setShowMeasurePanel(false)}>
						<div className="flex flex-col items-center space-y-2">
							<button
								onClick={() => {
									if (measureActive) {
										measureSourceRef.current.clear();
										setMeasuredDistance(null);
									}

									setMeasureActive((prev) => !prev);
								}}
								className={`
                  flex items-center justify-center gap-1
                  w-10 h-10
                  ${measureActive ? "bg-red-500 hover:bg-red-600" : "bg-amber-400 hover:bg-amber-500"}
                  text-gray-900
                  rounded-full shadow-sm
                  transition-colors duration-200
                `}
								title={measureActive ? "Cancel measurement" : "Measure distance"}
							>
								<Ruler size={18} />
							</button>

							{measuredDistance !== null && (
								<div className="w-full text-center">
									<span className="block text-xs font-medium">Last:</span>
									<span className="block text-sm font-semibold">
										{measuredDistance >= 1000
											? (measuredDistance / 1000).toFixed(2) + " km"
											: Math.round(measuredDistance) + " m"}
									</span>
									<button
										onClick={() => {
											measureSourceRef.current.clear();
											setMeasuredDistance(null);
										}}
										className="mt-1 text-[10px] text-red-400 hover:text-red-500 transition"
									>
										Clear
									</button>
								</div>
							)}
						</div>
					</Panel>
				)}

				{chatOpen && (
					<Panel
						title="Chat"
						className="absolute bottom-0 right-0 m-4 w-80 h-64 flex flex-col z-40"
						onClose={() => setChatOpen(false)}
					>
						<div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-slate-700">
							{chatMessages.map((msg, idx) => (
								<p key={idx} className="text-sm bg-slate-700/50 p-1 rounded text-white">
									{msg}
								</p>
							))}
						</div>
						<div className="flex mt-2">
							<input
								type="text"
								value={chatInput}
								onChange={(e) => setChatInput(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && sendChat()}
								placeholder="Type message..."
								className="flex-1 px-3 py-2 bg-slate-800 text-white rounded-l outline-none text-xs"
								autoFocus
							/>
							<button
								onClick={sendChat}
								className="bg-blue-600 hover:bg-blue-700 px-3 rounded-r text-white text-xs"
							>
								Send
							</button>
						</div>
					</Panel>
				)}

				{!chatOpen && (
					<Panel
						className="absolute bottom-4 right-4 w-auto px-3 py-1 z-50 cursor-pointer animate-pulse"
						onClose={() => setChatOpen(true)}
						noClose
					>
						<p className="text-[11px] text-slate-200 flex items-center gap-1">
							Press <span className="font-medium text-white text-xs">Enter</span> to chat
							{unread && <span className="w-2 h-2 bg-green-400 rounded-full animate-ping" />}
						</p>
					</Panel>
				)}
			</div>
		</div>
	);
}
