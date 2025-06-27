import Feature from "ol/Feature";
import Map from "ol/Map";
import View from "ol/View";
import { ScaleLine } from "ol/control";
import { Point, Polygon, LineString } from "ol/geom";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import { fromLonLat } from "ol/proj";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import {
	Style,
	Stroke,
	Fill,
	Text,
	Circle as CircleStyle,
} from "ol/style";
import { useEffect, useRef } from "react";

import { OBJECTIVE_STATE_STYLE_MAP } from "@/actions/models/ObjectiveState";
import { UnitSide, type Scenario, type ScenarioArea, type Unit } from "@/actions/proto/scenario";
import { createAreaStyleFactory } from "@/utils/createAreaStyleFactory";
import { getUnitStyle } from "@/utils/renderEntity";

interface GameMapPreviewProps {
	scenario: Scenario,
	areaTypes: { name: string, color: string }[],
	className?: string,
	allowInteraction?: boolean,
	onUnitSelect?: (unit: Unit)=> void,
	onAreaSelect?: (area: ScenarioArea)=> void,
	onMapReady?: (map: Map)=> void,
	sourceRef?: React.RefObject<VectorSource>,
	lineSourceRef?: React.RefObject<VectorSource>,
	selectedUnit?: Unit | null,
}

export function GameMapPreview({
	scenario,
	areaTypes,
	className,
	allowInteraction,
	onUnitSelect,
	onAreaSelect,
	onMapReady,
	sourceRef,
	lineSourceRef,
	selectedUnit,
}: GameMapPreviewProps) {
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstance = useRef<Map | null>(null);
	const featureSource = useRef(new VectorSource());
	const selectedFeatureRef = useRef<any>(null);
	const selectedUnitRef = useRef<Unit | null>(null);

	const getAreaStyle = useRef(
		createAreaStyleFactory(
			areaTypes.map((a) => ({
				type: a.name.toLowerCase(),
				label: a.name,
				color: a.color,
				fill: true,
			})),
		),
	);

	// selectedUnitRef in sync with prop
	useEffect(() => {
		selectedUnitRef.current = selectedUnit ?? null;
	}, [selectedUnit]);

	useEffect(() => {
		if (!mapRef.current || mapInstance.current) return;

		const measureLayer = new VectorLayer({
			source: sourceRef?.current ?? new VectorSource(),
			style: new Style({
				stroke: new Stroke({ color: "#f59e0b", width: 2 }),
			}),
		});

		const lineLayer = new VectorLayer({
			source: lineSourceRef?.current ?? new VectorSource(),
			style: new Style({
				stroke: new Stroke({ color: "#38bdf8", width: 2, lineDash: [6, 4] }),
			}),
		});

		const mainLayer = new VectorLayer({
			source: featureSource.current,
			style: (feature) => {
				const isSelected = selectedFeatureRef.current === feature;
				const type = feature.get("type");

				if (type === "unit") {
					return getUnitStyle(
						feature.get("unitIcon"),
						feature.get("side"),
						isSelected,
					);
				}

				if (type === "objective") {
					const state =
						feature.get("state") as keyof typeof OBJECTIVE_STATE_STYLE_MAP;
					const cfg = OBJECTIVE_STATE_STYLE_MAP[state];

					return new Style({
						image: new CircleStyle({
							radius: isSelected ? 12 : 10,
							fill: new Fill({ color: cfg.fill }),
							stroke: new Stroke({ color: cfg.stroke, width: 2 }),
						}),
						text: new Text({
							text: feature.get("letter"),
							font: "12px sans-serif",
							fill: new Fill({ color: cfg.text }),
						}),
					});
				}

				return getAreaStyle.current?.(feature, isSelected);
			},
		});

		const map = new Map({
			target: mapRef.current,
			layers: [
				new TileLayer({ source: new OSM() }),
				mainLayer,
				measureLayer,
				lineLayer,
			],
			view: new View({
				center: fromLonLat([0, 0]),
				zoom: 2,
			}),
			controls: [new ScaleLine({ units: "metric", minWidth: 64 })],
			interactions: allowInteraction ? undefined : [],
		});

		const handleClick = (evt) => {
			const unit = selectedUnitRef.current;

			// If a unit is selected → draw line and clear selection
			if (unit && unit.position && lineSourceRef?.current) {
				const from = fromLonLat([unit.position.lon, unit.position.lat]);
				const to = map.getCoordinateFromPixel(evt.pixel);

				const lineFeature = new Feature({
					geometry: new LineString([from, to]),
				});

				selectedFeatureRef.current = null;
				lineSourceRef.current.clear();
				lineSourceRef.current.addFeature(lineFeature);

				// Clear selected unit after drawing
				selectedUnitRef.current = null;
				onUnitSelect?.(null);

				map.getLayers().forEach((layer) => {
					if (layer instanceof VectorLayer) layer.changed();
				});

				return;
			}

			// Normal selection if no unit is selected
			const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f);
			const type = feature?.get("type");

			if (feature) {
				selectedFeatureRef.current = feature;

				if (type === "unit") {
					const unitId = feature.get("unitId");
					const unit = scenario.units.find((u) => u.id === unitId);
					if (unit) {
						selectedUnitRef.current = unit;
						lineSourceRef?.current?.clear();
						onUnitSelect?.(unit);
					}
				} else if (type === "area") {
					const areaId = feature.get("areaId");
					const area = scenario.areas?.find((a) => a.id === areaId);
					if (area) {
						onAreaSelect?.(area);
					}
				}
			} else {
				selectedFeatureRef.current = null;
			}

			map.getLayers().forEach((layer) => {
				if (layer instanceof VectorLayer) layer.changed();
			});
		};

		map.on("click", handleClick);
		mapInstance.current = map;
		onMapReady?.(map);
	}, [allowInteraction, scenario, areaTypes, onUnitSelect, onAreaSelect, onMapReady, sourceRef, lineSourceRef]);

	useEffect(() => {
		if (!mapInstance.current || !scenario) return;

		const src = featureSource.current;
		src.clear();

		scenario.units?.forEach((u) => {
			if (!u.position) return;
			const f = new Feature(
				new Point(fromLonLat([u.position.lon, u.position.lat])),
			);
			f.set("type", "unit");
			f.set("unitId", u.id);
			f.set("unitIcon", u.icon);
			f.set("side", u.side === UnitSide.BLUE ? "enemy" : "ally");
			src.addFeature(f);
		});

		scenario.objectives?.forEach((o) => {
			if (!o.position) return;
			const f = new Feature(
				new Point(fromLonLat([o.position.lon, o.position.lat])),
			);
			f.set("type", "objective");
			f.set("letter", o.letter);
			f.set("state", o.state === 1 ? "capturing" : o.state === 2 ? "captured" : "neutral");
			src.addFeature(f);
		});

		scenario.areas?.forEach((area) => {
			area.coordinates.forEach((ring) => {
				const coords = ring.points.map((p) => fromLonLat([p.lon, p.lat]));
				if (coords.length >= 2) {
					const [x0, y0] = coords[0];
					const [xN, yN] = coords[coords.length - 1];
					if (x0 !== xN || y0 !== yN) coords.push([x0, y0]);
				}

				const poly = new Feature(new Polygon([coords]));
				poly.set("type", area.type.toLowerCase());
				poly.set("areaId", area.id);
				featureSource.current.addFeature(poly);
			});
		});

		mapInstance.current.getView().fit(src.getExtent(), {
			padding: [20, 20, 20, 20],
			maxZoom: 12,
		});
	}, [scenario]);

	return <div ref={mapRef} className={className || "w-full h-full"} />;
}
