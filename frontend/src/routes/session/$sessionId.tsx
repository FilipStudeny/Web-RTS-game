import { createFileRoute, useParams } from "@tanstack/react-router";
import { Mouse } from "lucide-react";
import VectorSource from "ol/source/Vector";
import { useRef, useState } from "react";

import type { Scenario, ScenarioArea, Unit } from "@/actions/proto/scenario";
import type { UnitTypeKey } from "@/actions/proto/unit_types";
import type { Map } from "ol";

import { useGetEditorAreaTypes } from "@/actions/getEditorAreaTypes";
import { useGetEditorUnitTypes } from "@/actions/getEditorUnitTypes";
import { useGetScenarioById } from "@/actions/getScenarioById";
import { useDisconnectUser } from "@/actions/sessions/disconnectPlayer";
import { useGetSessionById } from "@/actions/sessions/getSessionById";
import { AreaInfoPanel } from "@/features/AreaInfoPanel";
import { ChatPanel } from "@/features/ChatPanel";
import { GameMapPreview } from "@/features/GameMap";
import { MeasurePanel } from "@/features/MeasurePanel";
import { ObjectiveBar, type Objective } from "@/features/ObjectiveBar";
import { ResourcesPanel } from "@/features/ResourcesPanel";
import { UnitInfoPanel } from "@/features/UnitDetailPanel";
import { useSocketStore } from "@/integrations/stores/useSocketStore";
import { canControlUnit } from "@/utils/canControlUnits";

export const Route = createFileRoute("/session/$sessionId")({
	component: RouteComponent,
});

function RouteComponent() {
	const { sessionId } = useParams({ strict: false }) as { sessionId: string };
	const { data: session, isLoading: isSessionLoading, error: sessionError } = useGetSessionById(sessionId);
	const { data: scenario, isLoading: isScenarioLoading, error: scenarioError } = useGetScenarioById(session?.scenarioId ?? "");
	const { data: unitTypes, isLoading: isLoadingUnitType } = useGetEditorUnitTypes();
	const { data: areaTypes, isLoading: isLoadingAreaTypes } = useGetEditorAreaTypes();
	const lineSourceRef = useRef<VectorSource>(new VectorSource());
	const measureSourceRef = useRef<VectorSource>(new VectorSource());
	const [chatOpen, setChatOpen] = useState(false);
	const [showMeasurePanel, setShowMeasurePanel] = useState(false);
	const [measureActive, setMeasureActive] = useState(false);
	const [measuredDistance, setMeasuredDistance] = useState<number | null>(null);
	const [selectedUnit, setSelectedUnitRaw] = useState<Unit | null>(null);
	const [selectedArea, setSelectedAreaRaw] = useState<ScenarioArea | null>(null);
	const [mapInstance, setMapInstance] = useState<Map | null>(null);
	const setSelectedUnit = (unit: Unit | null) => {
		setSelectedAreaRaw(null);
		setSelectedUnitRaw(unit);
	};

	const setSelectedArea = (area: ScenarioArea | null) => {
		setSelectedUnitRaw(null);
		setSelectedAreaRaw(area);
	};

	const { gameEnded, userId } = useSocketStore();
	const { mutate: disconnect, isPending, isError } = useDisconnectUser();

	if (isSessionLoading || isScenarioLoading || isLoadingUnitType || isLoadingAreaTypes) {
		return <div className="text-white p-4">Loading session and scenario...</div>;
	}

	if (sessionError || !session || scenarioError || !scenario || !unitTypes || !areaTypes) {
		return <div className="text-red-500 p-4">❌ Failed to load session or scenario.</div>;
	}

	const objectives: Objective[] = (scenario.objectives ?? [])
		.filter(obj => obj.position !== undefined)
		.map(obj => ({
			letter: obj.letter,
			state:
		  obj.state === 1
		  	? "capturing"
		  	: obj.state === 2
		  		? "captured"
		  		: "neutral",
			position: [obj.position!.lon, obj.position!.lat],
		}));

	const handleUnitClick = (unit: Unit | null) => {
		setSelectedUnit(unit); // Always show info, even if enemy
	};

	const handleUnitControl = (unit: Unit | null) => {
		if (userId === null) return;
		if (unit && !canControlUnit(unit, userId, session)) return;
		setSelectedUnit(unit);
	};

	const selectedUnitType = selectedUnit
		? unitTypes.find((t) => t.type === Number(selectedUnit.unitKey) as UnitTypeKey)
		: undefined;

	const selectedAreaDetails = selectedArea
		? areaTypes.find((a) => a.name.toLowerCase() === selectedArea.type.toLowerCase())
		: undefined;

	const unitCount = scenario.units.length;
	const unitsInBuild = 2; // Placeholder
	const supplies = 300; // Placeholder

	return (
		<div className="flex flex-1 w-full h-full text-white font-sans">
			<div className="flex-1 relative">
				<ObjectiveBar objectives={objectives} map={mapInstance} />

				<GameMapPreview
					scenario={scenario as Scenario}
					areaTypes={areaTypes.map(a => ({ name: a.name, color: a.color }))}
					allowInteraction
					onUnitClick={handleUnitClick} // For info display (any unit)
					onUnitSelect={handleUnitControl}					onAreaSelect={setSelectedArea}
					onMapReady={setMapInstance}
					sourceRef={measureSourceRef}
					lineSourceRef={lineSourceRef}
					selectedUnit={selectedUnit}
					className="absolute inset-0 z-0"
					sessionId={sessionId}
					session={session}
				/>

				<ResourcesPanel
					unitCount={unitCount}
					unitsInBuild={unitsInBuild}
					supplies={supplies}
				/>

				{selectedArea && selectedAreaDetails && (
					<AreaInfoPanel area={selectedAreaDetails} onClose={() => setSelectedArea(null)} />
				)}

				{selectedUnit && selectedUnitType && (
					<UnitInfoPanel
						unit={{
							...selectedUnit,
							...selectedUnitType,
						}}
						onClose={() => setSelectedUnit(null)}
					/>
				)}

				{selectedUnit && canControlUnit(selectedUnit, userId ?? "", session) && (
					<div
						className={`
			absolute bottom-5 left-1/2 transform -translate-x-1/2
			flex items-center gap-2
			px-4 py-2
			rounded-2xl border border-gray-700 bg-gray-800/80 backdrop-blur-md
			text-slate-200 text-sm
			shadow-lg
			transition-opacity duration-300
			${selectedUnit ? "opacity-100" : "opacity-0 pointer-events-none"}
		`}
					>
						<div className="relative">
							<Mouse className="w-5 h-5 text-blue-300" />
							<div
								className="absolute top-[2px] right-[4px] w-[6px] h-[10px] bg-white rounded-sm"
								title="Right click"
							/>
						</div>
						<span>
							<span className="font-semibold text-blue-200">Right click</span> to move the unit
						</span>
					</div>
				)}

				<MeasurePanel
					measureActive={measureActive}
					measuredDistance={measuredDistance}
					sourceRef={measureSourceRef}
					onToggleMeasure={() => setMeasureActive((prev) => !prev)}
					onClear={() => setMeasuredDistance(null)}
					show={showMeasurePanel}
					setShow={setShowMeasurePanel}
					mapRef={{ current: mapInstance }}
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
							onClick={() => userId && disconnect(userId)}
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
