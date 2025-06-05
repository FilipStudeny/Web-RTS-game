import { createFileRoute, useParams } from "@tanstack/react-router";
import Map from "ol/Map";
import VectorSource from "ol/source/Vector";
import { useRef, useState } from "react";

import { ChatPanel } from "@/features/ChatPanel";
import { GameMap } from "@/features/GameMap";
import { MeasurePanel } from "@/features/MeasurePanel";
import { ObjectiveBar, type Objective } from "@/features/ObjectiveBar";
import { ResourcesPanel } from "@/features/ResourcesPanel";
import { UnitInfoPanel, type Unit } from "@/features/UnitDetailPanel";

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

	const [objectives, setObjectives] = useState<Objective[]>([
		{ letter: "A", state: "captured", position: [-0.1276, 51.5074] }, // London
		{ letter: "B", state: "capturing", position: [2.3522, 48.8566] }, // Paris
		{ letter: "C", state: "neutral", position: [13.4050, 52.5200] }, // Berlin
		{ letter: "D", state: "neutral", position: [18.0686, 59.3293] }, // Stockholm
	]);

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
		</div>
	);
}
