import { createFileRoute, useParams } from "@tanstack/react-router";
import Map from "ol/Map";
import VectorSource from "ol/source/Vector";
import { useRef, useState } from "react";

import { useDisconnectUser } from "@/actions/sessions/disconnectPlayer";
import { ChatPanel } from "@/features/ChatPanel";
import { GameMap, type Area } from "@/features/GameMap";
import { MeasurePanel } from "@/features/MeasurePanel";
import { ObjectiveBar, type Objective } from "@/features/ObjectiveBar";
import { ResourcesPanel } from "@/features/ResourcesPanel";
import { UnitInfoPanel, type Unit } from "@/features/UnitDetailPanel";
import { useSocketStore } from "@/integrations/stores/useSocketStore";

function scaleRing(ring: [number, number][], factor: number): [number, number][] {
	const cx = ring.reduce((sum, c) => sum + c[0], 0) / ring.length;
	const cy = ring.reduce((sum, c) => sum + c[1], 0) / ring.length;

	return ring.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
}

function scaleAreas(areas: Area[], factor: number): Area[] {
	return areas.map(area => ({
		...area,
		coords: area.coords.map(ring => scaleRing(ring, factor)),
	}));
}

export const Route = createFileRoute("/session/$sessionId")({
	component: RouteComponent,
});

function RouteComponent() {
	const { sessionId } = useParams({ strict: false }) as { sessionId: string };
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstance = useRef<Map | null>(null);

	const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
	const [chatOpen, setChatOpen] = useState(false);
	const [map, setMap] = useState<Map | null>(null);

	const [showMeasurePanel, setShowMeasurePanel] = useState(false);
	const [measureActive, setMeasureActive] = useState(false);
	const [measuredDistance, setMeasuredDistance] = useState<number | null>(null);
	const measureSourceRef = useRef<VectorSource>(new VectorSource());
	const { gameEnded, userId } = useSocketStore();
	const { mutate: disconnect, isPending, isError } = useDisconnectUser();

	const [objectives, setObjectives] = useState<Objective[]>([
		{ letter: "A", state: "captured", position: [-0.1276, 51.5074] }, // London
		{ letter: "B", state: "capturing", position: [2.3522, 48.8566] }, // Paris
		{ letter: "C", state: "neutral", position: [13.4050, 52.5200] }, // Berlin
		{ letter: "D", state: "neutral", position: [18.0686, 59.3293] }, // Stockholm
	]);

	const demoAreas: Area[] = [
		{ id: "forest-1", type: "forest", coords: [[[-0.17, 51.51], [-0.15, 51.50], [-0.14, 51.52], [-0.17, 51.51]]] },
		{ id: "city-1", type: "city", coords: [[[2.34, 48.86], [2.36, 48.86], [2.36, 48.85], [2.34, 48.85], [2.34, 48.86]]] },
		// ... other areas ...
	];
	const scaledAreas = scaleAreas(demoAreas, 50);

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

	return (
		<div className="flex flex-1 w-full h-full text-white font-sans">
			<div className="flex-1 relative">
				<ObjectiveBar objectives={objectives} map={map} />

				<GameMap
					units={units}
					objectives={objectives}
					measureActive={measureActive}
					onSelectUnit={setSelectedUnit}
					onMeasure={(length) => {
						setMeasuredDistance(length || null);
						setMeasureActive(false);
					}}
					setMapInstance={(map) => {
						mapRef.current = map.getTargetElement() as HTMLDivElement;
						mapInstance.current = map;
						setMap(map);
					}}
					areas={scaledAreas}
				/>

				{selectedUnit && (
					<UnitInfoPanel unit={selectedUnit} onClose={() => setSelectedUnit(null)} />
				)}

				<ResourcesPanel
					unitCount={unitCount}
					unitsInBuild={unitsInBuild}
					supplies={supplies}
				/>

				<MeasurePanel
					measureActive={measureActive}
					measuredDistance={measuredDistance}
					sourceRef={measureSourceRef}
					onToggleMeasure={() => setMeasureActive((prev) => !prev)}
					onClear={() => setMeasuredDistance(null)}
					show={showMeasurePanel}
					setShow={setShowMeasurePanel}
				/>

				<ChatPanel open={chatOpen} setOpen={setChatOpen} />

			</div>

			{gameEnded && gameEnded.winnerId === userId && (
				<div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-90 text-white">
					<div className="text-center max-w-lg px-6">
						<h2 className="text-4xl font-bold mb-4">🎉 You Win!</h2>
						<p className="text-xl">The opponent has disconnected.</p>
						<p className="mt-2 text-sm text-gray-300">{gameEnded.reason}</p>

						<button
							className="mt-6 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg text-lg font-semibold transition disabled:opacity-50"
							onClick={() => {
								if (userId) disconnect(userId);
							}}
							disabled={isPending}
						>
							{isPending ? "Disconnecting..." : "Confirm"}
						</button>

						{isError && (
							<p className="mt-3 text-sm text-red-400">❌ Failed to disconnect. Please try again.</p>
						)}
					</div>
				</div>
			)}

		</div>
	);
}
