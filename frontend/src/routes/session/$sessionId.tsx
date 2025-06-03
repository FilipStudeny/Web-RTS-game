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
			className={`bg-gray-800/80 backdrop-blur-md border border-gray-700 rounded-2xl shadow-lg p-4 space-y-3 text-sm transition-all duration-300 ${className}`}
		>
			{(title || (onClose && !noClose)) && (
				<div className="flex justify-between items-center mb-2">
					{title && <h2 className="text-base font-semibold text-white">{title}</h2>}
					{onClose && !noClose && (
						<button
							onClick={onClose}
							className="text-gray-400 hover:text-red-400 transition"
							aria-label="Close panel"
						>
							<X size={18} />
						</button>
					)}
				</div>
			)}
			<div className="text-slate-200 overflow-auto max-h-full">{children}</div>
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
	// Initialize map, entity layer, select interaction, and measurement layer.
	// ——————————————————————————————————————————
	useEffect(() => {
		if (!mapRef.current || mapInstance.current) return;

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

		const vectorLayer = new VectorLayer({ source: vectorSourceRef.current });
		vectorSourceRef.current.clear();
		vectorSourceRef.current.addFeatures(features);

		measureLayerRef.current = new VectorLayer({
			source: measureSourceRef.current,
			style: (feature) => {
				const geometry = feature.getGeometry() as LineString;

				return new Style({
					stroke: new Stroke({
						color: "#ffd700",
						width: 2,
					}),
					text: new Text({
						font: "12px sans-serif",
						fill: new Fill({ color: "#ffffff" }),
						stroke: new Stroke({ color: "#000000", width: 3 }),
						text: formatLength(geometry),
						offsetY: -10,
					}),
				});
			},
		});

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

		const select = new Select({
			condition: click,
			style: null,
		});
		map.addInteraction(select);
		select.on("select", (e) => {
			const unit = e.selected[0]?.get("unitData");
			setSelectedUnit(unit ?? null);
		});

		mapInstance.current = map;
	}, [units]);

	// ——————————————————————————————————————————
	// Whenever measureActive toggles, add/remove the Draw interaction
	// ——————————————————————————————————————————
	useEffect(() => {
		const map = mapInstance.current;
		if (!map) return;

		// Clean up any old draw interaction
		if (drawInteractionRef.current) {
			map.removeInteraction(drawInteractionRef.current);
			drawInteractionRef.current = null;
		}

		if (measureActive) {
			// 1) create a new Draw interaction for LineString
			const draw = new Draw({
				source: measureSourceRef.current,
				type: "LineString",
				// Only allow two clicks before finishing;
				// using maxPoints: 2 means click once (start), click second (end)
				maxPoints: 2,
				style: new Style({
					stroke: new Stroke({
						color: "#ffd700",
						width: 2,
					}),
				}),
			});

			map.addInteraction(draw);
			drawInteractionRef.current = draw;

			// 2) on draw end, calculate length, store it, and turn off measure mode
			draw.on("drawend", (evt) => {
				const feature = evt.feature;
				const geom = feature.getGeometry() as LineString;
				const lengthMeters = getLength(geom, { projection: map.getView().getProjection() });
				setMeasuredDistance(lengthMeters);
				setMeasureActive(false);

				// keep the drawn line on-screen (so user sees it)—
				// measureSourceRef.current.clear();
			});
		}
	}, [measureActive]);

	// ——————————————————————————————————————————
	// Keyboard handling for chat (as before)
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
	// helper to format line length in meters/kilometers
	// ——————————————————————————————————————————
	function formatLength(line: LineString) {
		const length = getLength(line, { projection: mapInstance.current!.getView().getProjection() });
		let output;
		if (length > 1000) {
			output = (length / 1000).toFixed(2) + " km";
		} else {
			output = Math.round(length) + " m";
		}

		return output;
	}

	return (
		<div className="flex flex-1 w-full h-full text-white font-sans">
			<div className="flex-1 relative">
				<div ref={mapRef} className="absolute inset-0 z-0" />

				{selectedUnit && (
					<Panel title="Unit Info" className="absolute top-4 left-4 w-72">
						<div className="flex flex-col items-center space-y-2">
							<img
								src={`/images/units/${selectedUnit.type}.png`}
								alt={selectedUnit.type}
								className="w-16 h-16 object-contain"
							/>
							<table className="w-full text-sm text-left">
								<tbody>
									<tr>
										<td className="font-medium">Name:</td>
										<td>{selectedUnit.name}</td>
									</tr>
									<tr>
										<td className="font-medium">Health:</td>
										<td>{selectedUnit.health}</td>
									</tr>
									<tr>
										<td className="font-medium">Accuracy:</td>
										<td>{selectedUnit.accuracy}%</td>
									</tr>
									<tr>
										<td className="font-medium">Sight:</td>
										<td>{selectedUnit.sightRange} m</td>
									</tr>
									<tr>
										<td className="font-medium">Speed:</td>
										<td>{selectedUnit.movementSpeed} km/h</td>
									</tr>
								</tbody>
							</table>
						</div>
					</Panel>
				)}

				<Panel title="Status Overview" className="absolute bottom-0 left-0 m-4 w-80 h-auto">
					<div className="space-y-2">
						<p className="flex items-center gap-2">
							<Users size={16} /> <strong>Units:</strong> {unitCount}
						</p>
						<p className="flex items-center gap-2">
							<Hammer size={16} /> <strong>Building:</strong> {unitsInBuild}
						</p>
						<p className="flex items-center gap-2">
							<Package size={16} /> <strong>Supplies:</strong> {supplies}
						</p>
						<button
							onClick={() => {
								setMeasuredDistance(null);
								setMeasureActive((prev) => !prev);
							}}
							className={`mt-2 flex items-center gap-1 px-3 py-1 rounded ${
								measureActive
									? "bg-red-600 hover:bg-red-700"
									: "bg-blue-600 hover:bg-blue-700"
							}`}
						>
							<Ruler size={16} />
							{measureActive ? "Cancel Measure" : "Measure Distance"}
						</button>
					</div>
				</Panel>

				{measuredDistance !== null && (
					<Panel title="Measured Distance" className="absolute top-4 right-4 w-56">
						<p className="text-white">
							{measuredDistance >= 1000
								? (measuredDistance / 1000).toFixed(2) + " km"
								: Math.round(measuredDistance) + " m"}
						</p>
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
								<p key={idx} className="text-sm bg-slate-700/50 p-1.5 rounded text-white">
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
								className="flex-1 px-3 py-2 bg-slate-800 text-white rounded-l outline-none"
								autoFocus
							/>
							<button
								onClick={sendChat}
								className="bg-blue-600 hover:bg-blue-700 px-4 rounded-r text-white"
							>
								Send
							</button>
						</div>
					</Panel>
				)}

				{!chatOpen && (
					<Panel
						className="absolute bottom-4 right-4 w-auto px-4 py-2 z-50 cursor-pointer animate-pulse"
						onClose={() => setChatOpen(true)}
						noClose
					>
						<p className="text-sm text-slate-200 flex items-center gap-2">
							Press <span className="font-semibold text-white">Enter</span> to open chat
							{unread && <span className="w-2 h-2 bg-green-400 rounded-full animate-ping" />}
						</p>
					</Panel>
				)}
			</div>
		</div>
	);
}
