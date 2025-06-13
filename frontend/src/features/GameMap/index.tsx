import Feature from "ol/Feature";
import Map from "ol/Map";
import View from "ol/View";
import { click } from "ol/events/condition";
import { Point, LineString, Polygon } from "ol/geom";
import { Draw, Select } from "ol/interaction";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import { fromLonLat } from "ol/proj";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { getLength } from "ol/sphere";
import { Style, Stroke, Fill, Text, Circle as CircleStyle } from "ol/style";
import { useRef, useEffect } from "react";

import { type Objective } from "@/features/ObjectiveBar";
import { type Unit } from "@/features/UnitDetailPanel";
import { createAreaStyleFactory } from "@/utils/createAreaStyleFactory";
import { renderEntityFeatures, type Entity } from "@/utils/renderEntity";

const getAreaStyle = createAreaStyleFactory([
	{ type: "city", label: "CITY", color: "#f97316", fill: true },
	{ type: "forest", label: "FOREST", color: "#22c55e", fill: true },
]);

export interface Area {
	id: string,
	type: "city" | "forest",
	coords: Array<Array<[number, number]>>,
}

type GameMapProps = {
	units: Unit[],
	objectives: Objective[],
	areas: Area[],
	measureActive: boolean,
	onSelectUnit: (unit: Unit | null)=> void,
	onMeasure?: (distance: number)=> void,
	setMapInstance?: (map: Map)=> void,
};

export function GameMap({ units, objectives, areas, measureActive, onSelectUnit, onMeasure, setMapInstance }: GameMapProps) {
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstance = useRef<Map | null>(null);
	const unitSource = useRef(new VectorSource()).current;
	const objectiveSource = useRef(new VectorSource()).current;
	const areaSource = useRef(new VectorSource()).current;
	const measureSource = useRef(new VectorSource()).current;
	const measureLayerRef = useRef<VectorLayer<any> | null>(null);
	const drawRef = useRef<Draw | null>(null);

	// Initialize map and layers once
	useEffect(() => {
		if (!mapRef.current || mapInstance.current) return;

		const areaLayer = new VectorLayer({ source: areaSource, style: f => getAreaStyle(f, false) });
		const unitLayer = new VectorLayer({ source: unitSource });
		const objLayer = new VectorLayer({ source: objectiveSource, style: feature => {
			const state = feature.get("state"); const letter = feature.get("letter");
			let fill = "#374151", stroke = "#6B7280", text = "#D1D5DB";
			if (state === "capturing") [stroke, text] = ["#FBBF24", "#FCD34D"];
			else if (state === "captured") [fill, stroke, text] = ["#047857", "#10B981", "#ffffff"];

			return new Style({
				image: new CircleStyle({ radius: 16, fill: new Fill({ color: fill }), stroke: new Stroke({ color: stroke, width: 2 }) }),
				text: new Text({ text: letter, font: "14px sans-serif", fill: new Fill({ color: text }) }),
			});
		} });
		const measureLayer = new VectorLayer({ source: measureSource, style: feat => {
			const len = getLength(feat.getGeometry() as LineString);
			const txt = len > 1000 ? `${(len / 1000).toFixed(2)} km` : `${Math.round(len)} m`;

			return new Style({ stroke: new Stroke({ color: "#fbbf24", width: 2 }), text: new Text({ text: txt, font: "12px sans-serif", fill: new Fill({ color: "#fff" }), stroke: new Stroke({ color: "#000", width: 2 }), offsetY: -10 }) });
		} });
		measureLayerRef.current = measureLayer;

		const map = new Map({ target: mapRef.current, layers: [new TileLayer({ source: new OSM({ attributions: [] }) }), areaLayer, unitLayer, objLayer, measureLayer], view: new View({ center: fromLonLat([0, 0]), zoom: 3 }), controls: [] });

		// Selection
		const selectUnits = new Select({ condition: click, layers: [unitLayer], style: null });
		selectUnits.on("select", e => onSelectUnit(e.selected[0]?.get("unitData") ?? null));
		map.addInteraction(selectUnits);
		const selectMeasure = new Select({ condition: click, layers: [measureLayer], style: null });
		selectMeasure.on("select", e => { e.selected.forEach(f => measureSource.removeFeature(f)); onMeasure?.(0); selectMeasure.getFeatures().clear(); });
		map.addInteraction(selectMeasure);

		mapInstance.current = map;
		setMapInstance?.(map);
	}, []);

	// Render areas when prop changes
	useEffect(() => {
		if (!mapInstance.current) return;
		areaSource.clear();
		areas.forEach(area => area.coords.forEach(ring => {
			const coords = ring.map(([lon, lat]) => fromLonLat([lon, lat]));
			const feat = new Feature(new Polygon([coords])); feat.set("type", area.type);
			areaSource.addFeature(feat);
		}));
	}, [areas]);

	// Render units and objectives when props change
	useEffect(() => {
		if (!mapInstance.current) return;
		unitSource.clear();
		unitSource.addFeatures(units.flatMap(u => renderEntityFeatures({ id: u.id, name: u.name, type: u.type as Entity["type"], side: u.side, health: u.health, lon: u.position[0], lat: u.position[1], active: u.health > 0, sightRange: u.sightRange })));
		objectiveSource.clear();
		objectives.forEach(obj => { const f = new Feature(new Point(fromLonLat(obj.position))); f.set("letter", obj.letter); f.set("state", obj.state); objectiveSource.addFeature(f); });
	}, [units, objectives]);

	// Measure interaction
	useEffect(() => {
		const map = mapInstance.current; if (!map) return;
		if (drawRef.current) { map.removeInteraction(drawRef.current); drawRef.current = null; }

		if (measureActive) {
			const draw = new Draw({ source: measureSource, type: "LineString", maxPoints:2 });
			map.addInteraction(draw); drawRef.current = draw;
			draw.on("drawend", e => onMeasure?.(getLength(e.feature.getGeometry() as LineString)));
		}
	}, [measureActive]);

	return <div ref={mapRef} className="absolute inset-0 z-0" data-testid="map-container" />;
}
