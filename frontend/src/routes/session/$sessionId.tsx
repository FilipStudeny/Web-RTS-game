import { createFileRoute } from "@tanstack/react-router";
import { useParams } from "@tanstack/react-router";
import { Feature } from "ol";
import Map from "ol/Map";
import View from "ol/View";
import { click } from "ol/events/condition";
import { Point } from "ol/geom";
import { Select } from "ol/interaction";
import { Vector as VectorLayer } from "ol/layer";
import TileLayer from "ol/layer/Tile";
import { fromLonLat } from "ol/proj";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Fill, Circle as CircleStyle } from "ol/style";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/session/$sessionId")({
	component: RouteComponent,
});

function RouteComponent() {
	const { sessionId } = useParams({ strict: false }) as { sessionId: string };
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstance = useRef<Map | null>(null);
	const vectorSourceRef = useRef(new VectorSource());
	const [selectedUnit, setSelectedUnit] = useState<any>(null);
	const [combatLog, setCombatLog] = useState<string[]>([]);
	const [chatMessages, setChatMessages] = useState<string[]>([]);
	const [chatInput, setChatInput] = useState("");

	useEffect(() => {
		if (!mapRef.current || mapInstance.current) return;

		const features = [
			new Feature({
				geometry: new Point(fromLonLat([0, 0])),
				name: "Alpha",
				health: 100,
				speed: 30,
				direction: "North",
			}),
			new Feature({
				geometry: new Point(fromLonLat([5, 0])),
				name: "Bravo",
				health: 75,
				speed: 20,
				direction: "East",
			}),
		];

		features.forEach((feature) =>
			feature.setStyle(
				new Style({
					image: new CircleStyle({
						radius: 8,
						fill: new Fill({ color: "#60a5fa" }),
						stroke: new Stroke({ color: "#1e40af", width: 2 }),
					}),
				}),
			),
		);

		const vectorLayer = new VectorLayer({
			source: vectorSourceRef.current,
		});

		vectorSourceRef.current.addFeatures(features);


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
			setSelectedUnit(e.selected[0]?.getProperties() ?? null);
		});

		mapInstance.current = map;
	}, []);

	const sendChat = () => {
		if (chatInput.trim()) {
			setChatMessages([...chatMessages, `You: ${chatInput}`]);
			setChatInput("");
		}
	};

	return (
		<div className="flex h-screen text-white bg-gray-900 font-sans">
			<div className="flex-1 relative">
				<div ref={mapRef} className="absolute inset-0 z-0" />

				{/* Unit Info Panel */}
				{selectedUnit && (
					<div className="absolute top-4 left-4 bg-gray-800 bg-opacity-90 rounded p-4 w-64 shadow-lg">
						<h2 className="text-lg font-bold mb-2">Unit Info</h2>
						<p><strong>Name:</strong> {selectedUnit.name}</p>
						<p><strong>Health:</strong> {selectedUnit.health}</p>
						<p><strong>Speed:</strong> {selectedUnit.speed} km/h</p>
						<p><strong>Direction:</strong> {selectedUnit.direction}</p>
					</div>
				)}

				{/* Combat Log */}
				<div className="absolute bottom-0 left-0 m-4 bg-gray-800 bg-opacity-80 p-3 rounded w-80 h-48 overflow-y-auto shadow-inner text-sm">
					<h3 className="font-bold mb-2 text-slate-300">Combat Log</h3>
					{combatLog.length === 0 ? (
						<p className="text-gray-400 italic">No combat yet</p>
					) : (
						combatLog.map((log, idx) => (
							<p key={idx} className="text-slate-200">{log}</p>
						))
					)}
				</div>

				{/* Chat Panel */}
				<div className="absolute bottom-0 right-0 m-4 bg-gray-800 bg-opacity-90 p-3 rounded w-80 h-48 flex flex-col shadow-inner text-sm">
					<div className="flex-1 overflow-y-auto mb-2">
						<h3 className="font-bold mb-2 text-slate-300">Chat</h3>
						{chatMessages.map((msg, idx) => (
							<p key={idx} className="text-slate-200">{msg}</p>
						))}
					</div>
					<div className="flex">
						<input
							type="text"
							value={chatInput}
							onChange={(e) => setChatInput(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && sendChat()}
							placeholder="Type message..."
							className="flex-1 p-1 rounded-l bg-slate-700 text-white"
						/>
						<button
							onClick={sendChat}
							className="bg-blue-600 hover:bg-blue-700 px-3 rounded-r"
						>
							Send
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
