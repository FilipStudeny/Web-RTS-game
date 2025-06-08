import { Fill, Stroke, Style, Text } from "ol/style";

import type { FeatureLike } from "ol/Feature";

type AreaStyleConfig = {
	type: string,
	label: string,
	color: string,
	fill?: boolean,
};

export function createAreaStyleFactory(configs: AreaStyleConfig[]) {
	return function getStyle(feature: FeatureLike, isSelected: boolean): Style | undefined {
		const type = feature.get("type");
		const conf = configs.find((c) => c.type === type);
		if (!conf) return;

		const label = conf.label;
		const fillEnabled = conf.fill !== false;

		const strokeColor = isSelected ? "#ffffff" : conf.color;
		const fillColor = fillEnabled
			? isSelected
				? conf.color + "80"
				: conf.color + "40"
			: "rgba(0,0,0,0)";

		const extraLabel =
			type === "playable"
				? `\n${feature.get("widthKm")} × ${feature.get("heightKm")} km`
				: "";

		return new Style({
			stroke: new Stroke({ color: strokeColor, width: 2 }),
			fill: new Fill({ color: fillColor }),
			text: new Text({
				text: label + extraLabel,
				font: "bold 13px 'Orbitron', sans-serif",
				fill: new Fill({ color: "#f8fafc" }),
				stroke: new Stroke({ color: "#1e293b", width: 2 }),
				overflow: true,
				textAlign: "center",
				textBaseline: "middle",
			}),
		});
	};
}
