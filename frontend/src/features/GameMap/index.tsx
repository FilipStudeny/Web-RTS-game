import Feature from "ol/Feature";
import Map from "ol/Map";
import View from "ol/View";
import { ScaleLine } from "ol/control";
import { Point, Polygon } from "ol/geom";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import { fromLonLat } from "ol/proj";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { Style, Stroke, Fill, Text, Circle as CircleStyle } from "ol/style";
import { useEffect, useRef } from "react";

import { OBJECTIVE_STATE_STYLE_MAP } from "@/actions/models/ObjectiveState";
import { UnitSide, ObjectiveState as ProtoObjectiveState } from "@/actions/proto/create_scenario";
import { createAreaStyleFactory } from "@/utils/createAreaStyleFactory";
import { getUnitStyle } from "@/utils/renderEntity";

interface GameMapPreviewProps {
	scenario: any,
	areaTypes: { name: string, color: string }[],
	className?: string,
}

export function GameMapPreview({ scenario, areaTypes, className }: GameMapPreviewProps) {
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstance = useRef<Map | null>(null);
	const featureSource = useRef(new VectorSource());
	const getAreaStyle = useRef(createAreaStyleFactory(
		areaTypes.map((a) => ({
			type: a.name.toLowerCase(),
			label: a.name,
			color: a.color,
			fill: true,
		})),
	));

	useEffect(() => {
		if (!mapRef.current || mapInstance.current) return;

		const vectorLayer = new VectorLayer({
			source: featureSource.current,
			style: (feature) => {
				const type = feature.get("type");

				if (type === "unit") {
					return getUnitStyle(feature.get("unitIcon"), feature.get("side"), false);
				}

				if (type === "objective") {
					const state = feature.get("state") as keyof typeof OBJECTIVE_STATE_STYLE_MAP;
					const cfg = OBJECTIVE_STATE_STYLE_MAP[state];

					return new Style({
						image: new CircleStyle({
							radius: 10,
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

				return getAreaStyle.current?.(feature, false);
			},
		});

		const map = new Map({
			target: mapRef.current,
			layers: [new TileLayer({ source: new OSM() }), vectorLayer],
			view: new View({ center: fromLonLat([0, 0]), zoom: 2 }),
			controls: [new ScaleLine({ units: "metric", minWidth: 64 })],
			interactions: [],
		});

		mapInstance.current = map;
	}, []);

	useEffect(() => {
		if (!mapInstance.current || !scenario) return;

		const src = featureSource.current;
		src.clear();

		scenario.units.forEach((u: any) => {
			if (!u.position) return;
			const f = new Feature(new Point(fromLonLat([u.position.lon, u.position.lat])));
			f.set("type", "unit");
			f.set("side", u.side === UnitSide.ENEMY ? "enemy" : "ally");
			f.set("unitIcon", u.icon);
			src.addFeature(f);
		});

		scenario.objectives.forEach((o: any) => {
			if (!o.position) return;
			const f = new Feature(new Point(fromLonLat([o.position.lon, o.position.lat])));
			f.set("type", "objective");
			f.set("letter", o.letter);
			const stateKey =
        o.state === ProtoObjectiveState.CAPTURING
        	? "capturing"
        	: o.state === ProtoObjectiveState.CAPTURED
        		? "captured"
        		: "neutral";
			f.set("state", stateKey);
			src.addFeature(f);
		});

		scenario.areas.forEach((area: any) => {
			area.coordinates.forEach((ring: any) => {
				const coords = ring.points.map((p: any) => fromLonLat([p.lon, p.lat]));
				if (coords.length > 1) {
					const [x0, y0] = coords[0];
					const [xN, yN] = coords[coords.length - 1];
					if (x0 !== xN || y0 !== yN) coords.push([x0, y0]);
				}

				const poly = new Feature(new Polygon([coords]));
				poly.set("type", area.type.toLowerCase());
				src.addFeature(poly);
			});
		});

		mapInstance.current.getView().fit(src.getExtent(), { padding: [20, 20, 20, 20] });
	}, [scenario]);

	return <div ref={mapRef} className={className || "w-full aspect-[4/3] rounded border border-gray-600 overflow-hidden"} />;
}
