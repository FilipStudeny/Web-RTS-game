import { createFileRoute, useNavigate } from "@tanstack/react-router";
// OpenLayers core
import Map from "ol/Map";
import View from "ol/View";
import { click } from "ol/events/condition";
import { MultiPolygon, Point, Polygon } from "ol/geom";
import { Draw, Select } from "ol/interaction";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import { toLonLat } from "ol/proj";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Fill, Text, Circle as CircleStyle } from "ol/style";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

// Protos and Types
import type { Ring, Scenario, ScenarioArea, Unit } from "@/actions/proto/create_scenario";

// Custom Hooks
import { useCreateScenario } from "@/actions/createScenario";
import { useGetEditorAreaTypes } from "@/actions/getEditorAreaTypes";
import { useGetEditorUnitTypes } from "@/actions/getEditorUnitTypes";
import { type ObjectiveState, OBJECTIVE_STATE_STYLE_MAP } from "@/actions/models/ObjectiveState";
import { ObjectiveState as ProtoObjectiveState, UnitSide } from "@/actions/proto/create_scenario";
import { UnitTypeKey } from "@/actions/proto/unit_Types";
// UI Components
import { AreaInfoPanel } from "@/features/AreaInfoPanel";
import EditorSidebar from "@/features/EditorSidebar";
import { ObjectiveBar, type Objective } from "@/features/ObjectiveBar";
import { UnitInfoPanel } from "@/features/UnitDetailPanel";
import { useLoadingMessages } from "@/integrations/hooks/useLoadingMessages";
// Utilities
import { createAreaStyleFactory } from "@/utils/createAreaStyleFactory";
import { getUnitStyle } from "@/utils/renderEntity";

type DrawMode = string | null;

export const Route = createFileRoute("/editor")({
	component: ScenarioEditor,
});

export default function ScenarioEditor() {
	// Refs
	const mapContainerRef = useRef<HTMLDivElement | null>(null);
	const mapInstanceRef = useRef<Map | null>(null);
	const featureSourceRef = useRef(new VectorSource());
	const selectionRef = useRef<any>(null);

	// State
	const [activeDrawMode, setActiveDrawMode] = useState<DrawMode>(null);
	const [activeFeature, setActiveFeature] = useState<any>(null);
	const [scenarioTitle, setScenarioTitle] = useState("");
	const [chosenUnitType, setChosenUnitType] = useState<UnitTypeKey | null>(null);
	const [chosenUnitSide, setChosenUnitSide] = useState<"ally" | "enemy">("ally");
	const [objectives, setObjectives] = useState<Objective[]>([]);
	const [canCreateScenario, setCanCreateScenario] = useState(false);

	// Data hooks
	const { data: availableUnitTypes } = useGetEditorUnitTypes();
	const { data: availableAreas } = useGetEditorAreaTypes();

	// Mutation
	const {
		mutate: submitScenario,
		isPending,
		error: creationError,
		isSuccess,
	} = useCreateScenario();
	const [loadingMessage, messageVisible] = useLoadingMessages(isPending || isSuccess);

	// Navigation
	const navigate = useNavigate();

	// Toast error
	useEffect(() => {
		if (creationError) {
			toast.error("Failed to create scenario. Please try again.");
		}
	}, [creationError]);

	// Redirect on success
	useEffect(() => {
		if (isSuccess) {
			const timeout = setTimeout(() => {
				navigate({ to: "/" });
			}, 1000);

			return () => clearTimeout(timeout);
		}
	}, [isSuccess, navigate]);

	// Preload unit icons
	useEffect(() => {
		if (!availableUnitTypes) return;
		availableUnitTypes.forEach(unit => {
			const img = new Image();
			img.src = `/images/units/${unit.icon.toLowerCase()}.png`;
		});
	}, [availableUnitTypes]);

	// Style factory for areas
	const getAreaStyle = useRef<ReturnType<typeof createAreaStyleFactory> | null>(null);
	useEffect(() => {
		if (availableAreas) {
			const areaStyleConfigs = availableAreas.map(area => ({
				type: area.name.toLowerCase(),
				label: area.name.toUpperCase(),
				color: area.color,
				fill: true,
			}));
			getAreaStyle.current = createAreaStyleFactory(areaStyleConfigs);
		}
	}, [availableAreas]);

	// Map initialization
	useEffect(() => {
		if (!mapContainerRef.current || mapInstanceRef.current) return;

		const vectorLayer = new VectorLayer({
			source: featureSourceRef.current,
			style: feature => {
				const type = feature.get("type");
				const isSelected = selectionRef.current === feature;

				if (type === "unit") {
					return getUnitStyle(
						feature.get("unitIcon") || "default",
						feature.get("side") || "ally",
						isSelected,
					);
				}

				if (type === "objective") {
					const state = feature.get("state") as ObjectiveState;
					const styleConfig = OBJECTIVE_STATE_STYLE_MAP[state];

					return new Style({
						image: new CircleStyle({
							radius: isSelected ? 18 : 16,
							fill: new Fill({ color: styleConfig.fill }),
							stroke: new Stroke({ color: styleConfig.stroke, width: 2 }),
						}),
						text: new Text({
							text: feature.get("letter"),
							font: "14px sans-serif",
							fill: new Fill({ color: styleConfig.text }),
						}),
					});
				}

				return getAreaStyle.current?.(feature, isSelected);
			},
		});

		const map = new Map({
			target: mapContainerRef.current,
			layers: [new TileLayer({ source: new OSM({ attributions: [] }) }), vectorLayer],
			view: new View({ center: [0, 0], zoom: 2 }),
			controls: [],
		});

		const select = new Select({ condition: click, style: null });
		select.on("select", e => setActiveFeature(e.selected[0] || null));
		map.addInteraction(select);

		mapInstanceRef.current = map;
	}, []);

	// Highlight feature on selection
	useEffect(() => {
		selectionRef.current = activeFeature;
		mapInstanceRef.current?.getLayers().forEach(layer => {
			if (layer instanceof VectorLayer) layer.changed();
		});
	}, [activeFeature]);

	// Draw interaction setup
	useEffect(() => {
		const map = mapInstanceRef.current;
		if (!map) return;

		map.getInteractions().forEach(i => {
			if (i instanceof Draw) map.removeInteraction(i);
		});

		if (!activeDrawMode) return;

		const opts: any = { source: featureSourceRef.current };

		const draw = new Draw({
			...opts,
			type: activeDrawMode === "unit" || activeDrawMode === "objective" ? "Point" : "Polygon",
		});

		draw.on("drawend", e => {
			const feat = e.feature;

			if (activeDrawMode === "unit") {
				const selectedUnit = availableUnitTypes?.find(u => u.type === chosenUnitType);
				feat.set("type", "unit");
				feat.set("unitKey", chosenUnitType ?? UnitTypeKey.UNIT_TYPE_UNSPECIFIED);
				feat.set("side", chosenUnitSide);
				feat.set("unitIcon", selectedUnit?.icon ?? "default");

			} else if (activeDrawMode === "objective") {
				const existing = featureSourceRef.current.getFeatures().filter(f => f.get("type") === "objective");
				const letter = String.fromCharCode(65 + existing.length);
				feat.set("type", "objective");
				feat.set("letter", letter);
				feat.set("state", "neutral");

				const coord = (feat.getGeometry() as Point).getCoordinates();
				const lonlat = toLonLat(coord) as [number, number];
				setObjectives(objs => [...objs, { letter, state: "neutral", position: lonlat }]);

			} else {
				feat.set("type", activeDrawMode.toLowerCase());
			}
		});

		map.addInteraction(draw);
	}, [activeDrawMode, chosenUnitType, chosenUnitSide]);

	// Eligibility for scenario creation
	useEffect(() => {
		const source = featureSourceRef.current;
		const onAdd = () => updateScenarioEligibility();
		const onRemove = () => updateScenarioEligibility();

		source.on("addfeature", onAdd);
		source.on("removefeature", onRemove);
		updateScenarioEligibility();

		return () => {
			source.un("addfeature", onAdd);
			source.un("removefeature", onRemove);
		};
	}, []);

	// Derived data
	const selectedUnit =
		activeFeature?.get("type") === "unit" && availableUnitTypes
			? availableUnitTypes.find(u => u.type === activeFeature.get("unitKey"))
			: null;

	const selectedArea =
		activeFeature?.get("type") &&
		availableAreas?.find(a => a.name.toLowerCase() === activeFeature.get("type"));

	// Handlers
	const removeActive = () => {
		if (!activeFeature) return;
		if (activeFeature.get("type") === "objective") {
			const letter = activeFeature.get("letter");
			setObjectives(objs => objs.filter(o => o.letter !== letter));
		}

		featureSourceRef.current.removeFeature(activeFeature);
		setActiveFeature(null);
	};

	const updateScenarioEligibility = () => {
		const features = featureSourceRef.current.getFeatures();
		const allyCount = features.filter(f => f.get("type") === "unit" && f.get("side") === "ally").length;
		const enemyCount = features.filter(f => f.get("type") === "unit" && f.get("side") === "enemy").length;
		setCanCreateScenario(allyCount >= 1 && enemyCount >= 1);
	};

	const buildScenarioData = (): Scenario => {
		const features = featureSourceRef.current.getFeatures();

		const units: Unit[] = features
			.filter(f => f.get("type") === "unit")
			.map(f => {
				const coords = toLonLat((f.getGeometry() as Point).getCoordinates());

				return {
					position: { lon: coords[0], lat: coords[1] },
					unitKey: f.get("unitKey") ?? "UNIT_TYPE_UNSPECIFIED",
					side: f.get("side") === "enemy" ? UnitSide.ENEMY : UnitSide.ALLY,
					icon: f.get("unitIcon") ?? "default",
				};
			});

		const areas: ScenarioArea[] = features
			.filter(f => f.get("type") !== "unit" && f.get("type") !== "objective")
			.flatMap(f => {
				const type = f.get("type") as string;
				const geom = f.getGeometry();
				const rings: Ring[] = [];

				const processRing = (ring: number[][]) =>
					rings.push({
						points: ring.map(([x, y]) => {
							const [lon, lat] = toLonLat([x, y]);

							return { lon, lat };
						}),
					});

				if (geom instanceof Polygon) geom.getCoordinates().forEach(processRing);
				if (geom instanceof MultiPolygon)
					geom.getCoordinates().forEach(polygon => polygon.forEach(processRing));

				return [{ type, coordinates: rings }];
			});

		const scenario: Scenario = {
			name: scenarioTitle,
			objectives: objectives.map(obj => ({
				letter: obj.letter,
				state:
					obj.state === "capturing"
						? ProtoObjectiveState.CAPTURING
						: obj.state === "captured"
							? ProtoObjectiveState.CAPTURED
							: ProtoObjectiveState.NEUTRAL,
				position: { lon: obj.position[0], lat: obj.position[1] },
			})),
			units,
			areas,
		};

		console.log("Scenario created:", scenario);

		return scenario;
	};

	const handleCreateScenario = () => {
		const scenario = buildScenarioData();
		submitScenario(scenario);
	};

	// Render
	return (
		<div className="flex flex-1 w-full h-full text-white">
			<div className="w-2/3 h-full border-r border-slate-700 relative">
				<ObjectiveBar objectives={objectives} map={mapInstanceRef.current} />
				<div ref={mapContainerRef} className="w-full h-full" />

				{activeFeature && selectedUnit && (
					<UnitInfoPanel unit={selectedUnit} onClose={() => setActiveFeature(null)} />
				)}

				{activeFeature && selectedArea && (
					<AreaInfoPanel area={selectedArea} onClose={() => setActiveFeature(null)} />
				)}
			</div>

			<EditorSidebar
				scenarioName={scenarioTitle}
				setScenarioName={setScenarioTitle}
				drawType={activeDrawMode}
				setDrawType={setActiveDrawMode}
				selectedUnitType={chosenUnitType}
				setSelectedUnitType={setChosenUnitType}
				selectedUnitSide={chosenUnitSide}
				setSelectedUnitSide={setChosenUnitSide}
				deleteSelectedFeature={removeActive}
				unitTypes={availableUnitTypes ?? []}
				areaTypes={(availableAreas ?? []).map(a => ({
					name: a.name.toLowerCase(),
					color: a.color,
				}))}
				canCreateScenario={canCreateScenario}
				onCreateScenario={handleCreateScenario}
			/>

			{(isPending || isSuccess) && (
				<div className="fixed top-0 left-0 right-0 bottom-0 z-[9999] flex items-center justify-center bg-black/80">
					<div className="bg-slate-900/80 text-white px-8 py-6 rounded-xl shadow-xl flex flex-col items-center gap-4 w-[400px] min-h-[160px]">
						{isPending ? (
							<>
								<div className="animate-spin rounded-full h-10 w-10 border-4 border-white border-t-transparent" />
								<span
									className={`text-lg font-medium tracking-wide transition-opacity duration-300 ${
										messageVisible ? "opacity-100" : "opacity-0"
									}`}
									style={{ minHeight: "1.5rem", textAlign: "center" }}
								>
									{loadingMessage}
								</span>
							</>
						) : (
							<>
								<div className="text-green-400 text-4xl">✔</div>
								<span className="text-lg font-semibold text-center">
									Scenario successfully created. Redirecting...
								</span>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
