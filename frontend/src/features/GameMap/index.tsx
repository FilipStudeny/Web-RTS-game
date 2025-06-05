import Feature from "ol/Feature";
import Map from "ol/Map";
import View from "ol/View";
import { click } from "ol/events/condition";
import { Point, LineString } from "ol/geom";
import { Draw, Select } from "ol/interaction";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import { fromLonLat } from "ol/proj";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { getLength } from "ol/sphere";
import { Style, Stroke, Fill, Text, Circle as CircleStyle } from "ol/style";
import { useEffect, useRef } from "react";

import type { Objective } from "../ObjectiveBar";
import type { Unit } from "../UnitDetailPanel";

import { renderEntityFeatures, type Entity } from "@/utils/renderEntity";

type GameMapProps = {
	units: Unit[],
	objectives: Objective[],
	measureActive: boolean,
	onSelectUnit: (unit: Unit | null)=> void,
	onMeasure?: (distance: number)=> void,
	setMapInstance?: (map: Map)=> void,
};

export function GameMap({
	units,
	objectives,
	measureActive,
	onSelectUnit,
	onMeasure,
	setMapInstance,
}: GameMapProps) {
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstance = useRef<Map | null>(null);
	const unitSourceRef = useRef(new VectorSource());
	const objectiveSourceRef = useRef(new VectorSource());
	const measureSourceRef = useRef(new VectorSource());
	const measureLayerRef = useRef<VectorLayer<any> | null>(null);
	const drawInteractionRef = useRef<Draw | null>(null);

	// Create map + layers
	useEffect(() => {
		if (!mapRef.current || mapInstance.current) return;

		const unitFeatures = units.flatMap((unit) =>
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
		unitSourceRef.current.clear();
		unitSourceRef.current.addFeatures(unitFeatures);

		objectiveSourceRef.current.clear();
		objectives.forEach((obj) => {
			const feat = new Feature({
				geometry: new Point(fromLonLat(obj.position)),
				letter: obj.letter,
				state: obj.state,
				position: obj.position,
			});
			objectiveSourceRef.current.addFeature(feat);
		});

		const map = new Map({
			target: mapRef.current,
			layers: [
				new TileLayer({ source: new OSM({ attributions: [] }) }),
				new VectorLayer({ source: unitSourceRef.current }),
				new VectorLayer({
					source: objectiveSourceRef.current,
					style: (feature) => {
						const state = feature.get("state");
						const letter = feature.get("letter");
						let fillColor = "#374151";
						let strokeColor = "#6B7280";
						let textColor = "#D1D5DB";

						if (state === "capturing") {
							strokeColor = "#FBBF24";
							textColor = "#FCD34D";
						} else if (state === "captured") {
							strokeColor = "#10B981";
							fillColor = "#047857";
							textColor = "#ffffff";
						}

						return new Style({
							image: new CircleStyle({
								radius: 16,
								fill: new Fill({ color: fillColor }),
								stroke: new Stroke({ color: strokeColor, width: 2 }),
							}),
							text: new Text({
								text: letter,
								font: "14px sans-serif",
								fill: new Fill({ color: textColor }),
							}),
						});
					},
				}),
				(measureLayerRef.current = new VectorLayer({
					source: measureSourceRef.current,
					style: (feature) => {
						const geom = feature.getGeometry() as LineString;
						const length = getLength(geom);

						return new Style({
							stroke: new Stroke({ color: "#fbbf24", width: 2 }),
							text: new Text({
								text: length > 1000 ? `${(length / 1000).toFixed(2)} km` : `${Math.round(length)} m`,
								fill: new Fill({ color: "#fff" }),
								stroke: new Stroke({ color: "#000", width: 2 }),
								font: "12px sans-serif",
								offsetY: -10,
							}),
						});
					},
				})),
			],
			view: new View({
				center: fromLonLat([0, 0]),
				zoom: 3,
				minResolution: 0.5,
			}),
			controls: [],
		});

		// Unit selection
		const selectUnits = new Select({
			condition: click,
			style: null,
			layers: (layer) => layer.getSource() === unitSourceRef.current,
		});
		map.addInteraction(selectUnits);
		selectUnits.on("select", (e) => {
			onSelectUnit(e.selected[0]?.get("unitData") ?? null);
		});

		// Measurement delete on click
		const selectMeasure = new Select({
			condition: click,
			style: null,
			layers: [measureLayerRef.current],
		});
		map.addInteraction(selectMeasure);
		selectMeasure.on("select", (e) => {
			e.selected.forEach((feat) => measureSourceRef.current.removeFeature(feat));
			onMeasure?.(0);
			selectMeasure.getFeatures().clear();
		});

		mapInstance.current = map;
		setMapInstance?.(map);
	}, []);

	// Handle draw interaction
	useEffect(() => {
		const map = mapInstance.current;
		if (!map) return;

		if (drawInteractionRef.current) {
			map.removeInteraction(drawInteractionRef.current);
			drawInteractionRef.current = null;
		}

		if (measureActive) {
			const draw = new Draw({
				source: measureSourceRef.current,
				type: "LineString",
				maxPoints: 2,
				style: new Style({ stroke: new Stroke({ color: "#fbbf24", width: 2 }) }),
			});
			map.addInteraction(draw);
			drawInteractionRef.current = draw;

			draw.on("drawend", (e) => {
				const length = getLength(e.feature.getGeometry() as LineString);
				onMeasure?.(length);
			});
		}
	}, [measureActive]);

	return <div ref={mapRef} className="absolute inset-0 z-0" />;
}
