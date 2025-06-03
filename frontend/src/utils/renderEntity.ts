import { Feature } from "ol";
import Circle from "ol/geom/Circle";
import Point from "ol/geom/Point";
import { fromLonLat } from "ol/proj";
import { Icon, Style, Fill, Stroke } from "ol/style";

import type { Geometry } from "ol/geom";

export type Entity = {
	id: string,
	name: string,
	type: "infantry" | "tank" | "armour" | "recon",
	side: "friendly" | "enemy",
	health: number,
	lon: number,
	lat: number,
	active: boolean,
	heading?: number,
	sightRange: number,
};

export const renderEntityFeatures = (entity: Entity): Feature<Geometry>[] => {
	const position = fromLonLat([entity.lon, entity.lat]);

	const tint = entity.active
		? entity.side === "enemy"
			? [255, 100, 100]
			: [200, 225, 255]
		: [128, 128, 128];

	const iconFeature = new Feature({
		geometry: new Point(position),
	});
	iconFeature.set("unitData", entity);
	iconFeature.set("isUnitIcon", true);

	const iconStyle = new Style({
		image: new Icon({
			src: `/images/units/${entity.type}.png`,
			scale: 0.05, // smaller icon
			color: `rgb(${tint.join(",")})`,
			anchor: [0.5, 0.5],
			anchorXUnits: "fraction",
			anchorYUnits: "fraction",
			rotation: ((entity.heading ?? 0) * Math.PI) / 180,
			opacity: entity.active ? 1 : 0.5,
		}),
	});
	iconFeature.setStyle(iconStyle);

	const circleFeature = new Feature({
		geometry: new Circle(position, entity.sightRange),
	});
	circleFeature.setStyle(
		new Style({
			stroke: new Stroke({
				color: `rgba(${tint.join(",")}, 0.9)`,
				width: 2,
			}),
			fill: new Fill({
				color: `rgba(${tint.join(",")}, 0.15)`,
			}),
		}),
	);

	return [circleFeature, iconFeature];
};
