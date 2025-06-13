// src/features/ScenarioEditor.tsx
import { createFileRoute } from "@tanstack/react-router";
import Map from "ol/Map";
import View from "ol/View";
import { click } from "ol/events/condition";
import { Point } from "ol/geom";
import { Draw, Select } from "ol/interaction";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import { toLonLat } from "ol/proj";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Fill, Text, Circle as CircleStyle } from "ol/style";
import { useEffect, useRef, useState } from "react";

import { useGetEditorAreaTypes } from "@/actions/getEditorAreaTypes";
import { useGetEditorUnitTypes } from "@/actions/getEditorUnitTypes";
import { UnitTypeKey } from "@/actions/proto/unit_Types";
import { AreaInfoPanel } from "@/features/AreaInfoPanel";
import EditorSidebar from "@/features/EditorSidebar";
import { ObjectiveBar } from "@/features/ObjectiveBar";
import { UnitInfoPanel } from "@/features/UnitDetailPanel";
import { createAreaStyleFactory } from "@/utils/createAreaStyleFactory";
import { getUnitStyle } from "@/utils/renderEntity";

export type Objective = {
	letter: string,
	state: "neutral" | "capturing" | "captured",
	position: [number, number], // [lon, lat]
};

type DrawMode = string | null;

export const Route = createFileRoute("/editor")({
	component: ScenarioEditor,
});

export default function ScenarioEditor() {
	const mapContainerRef = useRef<HTMLDivElement | null>(null);
	const mapInstanceRef = useRef<Map | null>(null);
	const featureSourceRef = useRef(new VectorSource());
	const selectionRef = useRef<any>(null);

	const [activeDrawMode, setActiveDrawMode] = useState<DrawMode>(null);
	const [activeFeature, setActiveFeature] = useState<any>(null);
	const [scenarioTitle, setScenarioTitle] = useState("");
	const [chosenUnitType, setChosenUnitType] = useState<UnitTypeKey | null>(null);
	const [chosenUnitSide, setChosenUnitSide] = useState<"ally" | "enemy">("ally");
	const [objectives, setObjectives] = useState<Objective[]>([]);

	const { data: availableUnitTypes } = useGetEditorUnitTypes();
	const { data: availableAreas } = useGetEditorAreaTypes();
	const [canCreateScenario, setCanCreateScenario] = useState(false);

	// preload unit icons
	useEffect(() => {
		if (!availableUnitTypes) return;
		availableUnitTypes.forEach((unit) => {
			const img = new Image();
			img.src = `/images/units/${unit.icon.toLowerCase()}.png`;
		});
	}, [availableUnitTypes]);

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

	// initialize map & interactions
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
					const state = feature.get("state");
					let fill = "#374151", stroke = "#6B7280", textCol = "#D1D5DB";
					if (state === "capturing") [stroke, textCol] = ["#FBBF24", "#FCD34D"];
					else if (state === "captured") [fill, stroke, textCol] = ["#047857", "#10B981", "#ffffff"];

					return new Style({
						image: new CircleStyle({
							radius: isSelected ? 18 : 16,
							fill: new Fill({ color: fill }),
							stroke: new Stroke({ color: stroke, width: 2 }),
						}),
						text: new Text({
							text: feature.get("letter"),
							font: "14px sans-serif",
							fill: new Fill({ color: textCol }),
						}),
					});
				}

				return getAreaStyle.current?.(feature, isSelected);
			},
		});

		const map = new Map({
			target: mapContainerRef.current,
			layers: [
				new TileLayer({ source: new OSM({ attributions: [] }) }),
				vectorLayer,
			],
			view: new View({ center: [0, 0], zoom: 2 }),
			controls: [],
		});

		// select interaction
		const select = new Select({ condition: click, style: null });
		select.on("select", e => setActiveFeature(e.selected[0] || null));
		map.addInteraction(select);

		mapInstanceRef.current = map;
	}, []);

	// refresh layer on selection change
	useEffect(() => {
		selectionRef.current = activeFeature;
		mapInstanceRef.current?.getLayers().forEach(layer => {
			if (layer instanceof VectorLayer) layer.changed();
		});
	}, [activeFeature]);

	// draw interaction
	useEffect(() => {
		const map = mapInstanceRef.current;
		if (!map) return;

		// remove old Draw
		map.getInteractions().forEach(i => {
			if (i instanceof Draw) map.removeInteraction(i);
		});

		if (!activeDrawMode) return;

		const opts: any = { source: featureSourceRef.current };

		if (activeDrawMode === "unit") {
			opts.type = "Point";
			const draw = new Draw(opts);
			draw.on("drawend", e => {
				e.feature.set("type", "unit");
				e.feature.set("unitKey", chosenUnitType ?? UnitTypeKey.UNIT_TYPE_UNSPECIFIED);
				e.feature.set("side", chosenUnitSide);

				const selectedUnit = availableUnitTypes?.find(u => u.type === chosenUnitType);
				e.feature.set("unitIcon", selectedUnit?.icon ?? "default");
			});

			map.addInteraction(draw);
		} else if (activeDrawMode === "objective") {
			opts.type = "Point";
			const draw = new Draw(opts);
			draw.on("drawend", e => {
				const feat = e.feature;
				feat.set("type", "objective");
				// calculate letter
				const existing = featureSourceRef.current.getFeatures().filter(f => f.get("type") === "objective");
				const letter = String.fromCharCode(65 + existing.length);
				feat.set("letter", letter);
				feat.set("state", "neutral");

				// store in React state
				const coord = (feat.getGeometry() as Point).getCoordinates();
				const lonlat = toLonLat(coord) as [number, number];
				setObjectives(objs => [...objs, { letter, state: "neutral", position: lonlat }]);
			});
			map.addInteraction(draw);
		} else {
			opts.type = "Polygon";
			const draw = new Draw(opts);
			draw.on("drawend", e => {
				e.feature.set("type", activeDrawMode.toLowerCase()); // ensure matching
			});
			map.addInteraction(draw);
		}

	}, [activeDrawMode, chosenUnitType, chosenUnitSide]);

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

	const removeActive = () => {
		if (!activeFeature) return;
		if (activeFeature.get("type") === "objective") {
			const letter = activeFeature.get("letter");
			setObjectives(objs => objs.filter(o => o.letter !== letter));
		}

		featureSourceRef.current.removeFeature(activeFeature);
		setActiveFeature(null);
	};

	const selectedUnit =
	activeFeature?.get("type") === "unit" && availableUnitTypes
		? availableUnitTypes.find((u) => u.type === activeFeature.get("unitKey"))
		: null;

	const selectedArea =
	activeFeature?.get("type") &&
	availableAreas?.find(
		a => a.name.toLowerCase() === activeFeature.get("type"),
	);

	const updateScenarioEligibility = () => {
		const features = featureSourceRef.current.getFeatures();
		const allyCount = features.filter(f => f.get("type") === "unit" && f.get("side") === "ally").length;
		const enemyCount = features.filter(f => f.get("type") === "unit" && f.get("side") === "enemy").length;
		setCanCreateScenario(allyCount >= 1 && enemyCount >= 1);
	};

	return (
		<div className="flex flex-1 w-full h-full text-white">
			<div className="w-2/3 h-full border-r border-slate-700 relative">
				<ObjectiveBar objectives={objectives} map={mapInstanceRef.current} />
				<div ref={mapContainerRef} className="w-full h-full" />

				{activeFeature && selectedUnit && (
					<UnitInfoPanel
						unit={selectedUnit}
						onClose={() => setActiveFeature(null)}
					/>
				)}

				{activeFeature && selectedArea && (
					<AreaInfoPanel
						area={selectedArea}
						onClose={() => setActiveFeature(null)}
					/>
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
				onCreateScenario={() => {
					console.log("Scenario created:", {
						name: scenarioTitle,
						units: featureSourceRef.current.getFeatures().filter(f => f.get("type") === "unit"),
						objectives,
					});
				}}
			/>

		</div>
	);
}
