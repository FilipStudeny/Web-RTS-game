import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import Map from "ol/Map";
import View from "ol/View";
import { click } from "ol/events/condition";
import { Draw, Select } from "ol/interaction";
import { createBox } from "ol/interaction/Draw";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { useEffect, useRef, useState } from "react";

import { UnitTypeList } from "@/actions/proto/unit_Types";
import EditorSidebar from "@/features/EditorSidebar";
import { UnitInfoPanel } from "@/features/UnitDetailPanel";
import { createAreaStyleFactory } from "@/utils/createAreaStyleFactory";
import { getUnitStyle } from "@/utils/renderEntity";

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

const areaConfigs = [
	{ type: "city", label: "CITY", color: "#f97316", fill: true },
	{ type: "forest", label: "FOREST", color: "#22c55e", fill: true },
	{ type: "playable", label: "PLAYABLE AREA", color: "#0ea5e9", fill: false }, // 👈 no fill
];

const getAreaStyle = createAreaStyleFactory(areaConfigs);

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
	const [selectedUnitType, setSelectedUnitType] = useState<string | null>(null);
	const [selectedUnitSide, setSelectedUnitSide] = useState<"ally" | "enemy">("ally");
	const [error, setError] = useState<string | null>(null);

	const { data: unitTypes } = useUnitTypes();
	const selectedFeatureRef = useRef<any>(null);

	useEffect(() => {
		if (!unitTypes) return;
		unitTypes.forEach((unit) => {
			const img = new Image();
			img.src = `/images/units/${unit.icon.toLowerCase()}.png`;
		});
	}, [unitTypes]);

	useEffect(() => {
		selectedFeatureRef.current = selectedFeature;
		mapInstance.current?.getLayers().forEach((layer) => {
			if (layer instanceof VectorLayer) layer.changed();
		});
	}, [selectedFeature]);

	useEffect(() => {
		if (!mapRef.current || mapInstance.current) return;

		const vectorLayer = new VectorLayer({
			source: vectorSourceRef.current,
			style: (feature) => {
				const type = feature.get("type");
				const isSelected = selectedFeatureRef.current === feature;

				if (type === "unit") {
					const icon = feature.get("unitIcon") ?? "default";
					const side = feature.get("side") ?? "ally";

					return getUnitStyle(icon, side, isSelected);
				}

				return getAreaStyle(feature, isSelected);
			},
		});

		const map = new Map({
			target: mapRef.current,
			layers: [new TileLayer({ source: new OSM({ attributions: [] }) }), vectorLayer],
			view: new View({ center: [0, 0], zoom: 2 }),
			controls: [],
		});

		const select = new Select({ condition: click, style: null });
		map.addInteraction(select);
		select.on("select", (e) => {
			setSelectedFeature(e.selected[0] || null);
		});

		mapInstance.current = map;
	}, []);

	useEffect(() => {
		if (!mapInstance.current) return;
		mapInstance.current.getInteractions().forEach((interaction) => {
			if (interaction instanceof Draw) mapInstance.current!.removeInteraction(interaction);
		});
		if (!drawType || !playableAreaDrawn) return;

		const source = vectorSourceRef.current;

		if (drawType === "unit") {
			const draw = new Draw({ source, type: "Point" });
			draw.on("drawend", (e) => {
				e.feature.set("type", "unit");
				e.feature.set("unitIcon", selectedUnitType ?? "default");
				e.feature.set("side", selectedUnitSide);
			});
			mapInstance.current.addInteraction(draw);

			return;
		}

		const draw = new Draw({ source, type: "Polygon" });
		draw.on("drawend", (e) => {
			e.feature.set("type", drawType);
		});
		mapInstance.current.addInteraction(draw);
	}, [drawType, playableAreaDrawn, selectedUnitType, selectedUnitSide]);

	useEffect(() => {
		mapInstance.current?.getLayers().forEach((layer) => {
			if (layer instanceof VectorLayer) layer.changed();
		});
	}, [selectedFeature]);

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
		const draw = new Draw({ source: vectorSourceRef.current, type: "Circle", geometryFunction: createBox() });
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

	const selectedUnitData = selectedFeature?.get("type") === "unit" && unitTypes
		? unitTypes.find((u) => u.icon === selectedFeature.get("unitIcon"))
		: null;

	return (
		<div className="flex flex-1 w-full h-full text-white">
			<div className="w-2/3 h-full border-r border-slate-700 relative">
				<div ref={mapRef} className="w-full h-full" />
				{selectedFeature && selectedUnitData && (
					<UnitInfoPanel
						unit={{
							id: selectedFeature.ol_uid.toString(),
							name: selectedUnitData.name,
							health: selectedUnitData.health,
							accuracy: selectedUnitData.accuracy,
							sightRange: selectedUnitData.sightRange,
							movementSpeed: selectedUnitData.movementSpeed,
							position: selectedFeature.getGeometry()?.getCoordinates() || [0, 0],
							type: selectedUnitData.icon,
							side: selectedFeature.get("side") || "ally",
						}}
						onClose={() => setSelectedFeature(null)}
					/>
				)}
			</div>

			<EditorSidebar
				scenarioName={scenarioName}
				setScenarioName={setScenarioName}
				playableAreaDrawn={playableAreaDrawn}
				drawType={drawType}
				setDrawType={setDrawType}
				selectedUnitType={selectedUnitType}
				setSelectedUnitType={setSelectedUnitType}
				selectedUnitSide={selectedUnitSide}
				setSelectedUnitSide={setSelectedUnitSide}
				error={error}
				setError={setError}
				drawPlayableArea={drawPlayableArea}
				deleteSelectedFeature={deleteSelectedFeature}
				unitTypes={unitTypes ?? []}
			/>
		</div>
	);
}
