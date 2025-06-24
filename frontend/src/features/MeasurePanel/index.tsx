import { Ruler } from "lucide-react";
import { Map } from "ol";
import Overlay from "ol/Overlay";
import { LineString } from "ol/geom";
import Draw from "ol/interaction/Draw";
import VectorSource from "ol/source/Vector";
import { getLength } from "ol/sphere";
import { useEffect, useRef } from "react";

import { Panel } from "@/components/Panel";

type MeasurePanelProps = {
	measureActive: boolean,
	measuredDistance: number | null,
	sourceRef: React.RefObject<VectorSource>,
	onToggleMeasure: ()=> void,
	onClear: ()=> void,
	show: boolean,
	setShow: (val: boolean)=> void,
	mapRef?: React.RefObject<Map | null>,
};

export function MeasurePanel({
	measureActive,
	measuredDistance,
	sourceRef,
	onToggleMeasure,
	onClear,
	show,
	setShow,
	mapRef,
}: MeasurePanelProps) {
	const drawInteraction = useRef<Draw | null>(null);
	const tooltipOverlay = useRef<Overlay | null>(null);
	const tooltipElement = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!measureActive || !sourceRef.current || !mapRef?.current) return;

		const map = mapRef.current;
		const source = sourceRef.current;

		const draw = new Draw({
			source,
			type: "LineString",
			maxPoints: 2,
		});

		drawInteraction.current = draw;

		const tooltip = document.createElement("div");
		tooltip.className = "ol-tooltip ol-tooltip-measure";
		Object.assign(tooltip.style, {
			position: "absolute",
			background: "#222",
			color: "#fff",
			padding: "2px 6px",
			borderRadius: "4px",
			whiteSpace: "nowrap",
			fontSize: "11px",
			pointerEvents: "none",
			transform: "translate(-50%, -100%)",
		});
		document.body.appendChild(tooltip);
		tooltipElement.current = tooltip;

		const overlay = new Overlay({
			element: tooltip,
			offset: [0, -15],
			positioning: "bottom-center",
		});
		map.addOverlay(overlay);
		tooltipOverlay.current = overlay;

		let sketch: any = null;

		draw.on("drawstart", (e) => {
			sketch = e.feature;
			tooltip.style.display = "block";

			const geom = sketch.getGeometry() as LineString;

			geom.on("change", (evt) => {
				const line = evt.target as LineString;
				const coord = line.getLastCoordinate();
				tooltip.innerHTML = formatLength(line);
				overlay.setPosition(coord);
			});
		});

		draw.on("drawend", (e) => {
			const geom = e.feature.getGeometry() as LineString;
			const length = getLength(geom);

			if (length > 0) {
				// Create a static tooltip overlay at midpoint
				const label = document.createElement("div");
				label.className = "ol-tooltip ol-tooltip-static";
				label.innerHTML = formatLength(geom);
				Object.assign(label.style, {
					position: "absolute",
					background: "#222",
					color: "#fff",
					padding: "2px 6px",
					borderRadius: "4px",
					whiteSpace: "nowrap",
					fontSize: "11px",
					pointerEvents: "none",
					transform: "translate(-50%, -100%)",
				});

				const labelOverlay = new Overlay({
					element: label,
					offset: [0, -10],
					positioning: "bottom-center",
				});

				const midpoint = getLineMidpoint(geom);
				labelOverlay.setPosition(midpoint);
				map.addOverlay(labelOverlay);
			}

			onToggleMeasure(); // disables measurement mode
			sketch = null;
			tooltip.style.display = "none";
		});

		map.addInteraction(draw);

		return () => {
			if (drawInteraction.current) map.removeInteraction(drawInteraction.current);
			if (tooltipOverlay.current) map.removeOverlay(tooltipOverlay.current);
			if (tooltipElement.current?.parentNode) {
				tooltipElement.current.parentNode.removeChild(tooltipElement.current);
			}

			drawInteraction.current = null;
			tooltipOverlay.current = null;
			tooltipElement.current = null;
		};
	}, [measureActive, sourceRef?.current, mapRef?.current]);

	function formatLength(line: LineString): string {
		const length = getLength(line);

		return length >= 1000 ? `${(length / 1000).toFixed(2)} km` : `${Math.round(length)} m`;
	}

	if (!show) {
		return (
			<button
				onClick={() => setShow(true)}
				className="absolute top-4 right-4 w-8 h-8 bg-gray-800/50 hover:bg-gray-800/75 rounded-full flex items-center justify-center text-gray-200 hover:text-white transition"
				title="Open measurement tool"
			>
				<Ruler size={18} />
			</button>
		);
	}

	return (
		<Panel title="Measure" className="absolute top-4 right-4 w-48" onClose={() => setShow(false)}>
			<div className="flex flex-col items-center space-y-2">
				<button
					onClick={() => {
						if (measureActive) {
							sourceRef.current?.clear();
							onClear();
						}

						onToggleMeasure();
					}}
					className={`
						flex items-center justify-center gap-1
						w-10 h-10
						${measureActive ? "bg-red-500 hover:bg-red-600" : "bg-amber-400 hover:bg-amber-500"}
						text-gray-900 rounded-full shadow-sm transition-colors duration-200
					`}
					title={measureActive ? "Cancel measurement" : "Measure distance"}
				>
					<Ruler size={18} />
				</button>

				{measuredDistance !== null && (
					<div className="w-full text-center">
						<span className="block text-xs font-medium">Last:</span>
						<span className="block text-sm font-semibold">
							{measuredDistance >= 1000
								? (measuredDistance / 1000).toFixed(2) + " km"
								: Math.round(measuredDistance) + " m"}
						</span>
						<button
							onClick={() => {
								sourceRef.current?.clear();
								onClear();
							}}
							className="mt-1 text-[10px] text-red-400 hover:text-red-500 transition"
						>
							Clear
						</button>
					</div>
				)}
			</div>
		</Panel>
	);
}

function getLineMidpoint(line: LineString): [number, number] {
	const coords = line.getCoordinates();
	if (coords.length < 2) return coords[0] as [number, number];

	const length = getLength(line);
	let accumulated = 0;

	for (let i = 0; i < coords.length - 1; i++) {
		const seg = new LineString([coords[i], coords[i + 1]]);
		const segLen = getLength(seg);
		if (accumulated + segLen >= length / 2) {
			const frac = (length / 2 - accumulated) / segLen;
			const dx = coords[i + 1][0] - coords[i][0];
			const dy = coords[i + 1][1] - coords[i][1];

			return [coords[i][0] + dx * frac, coords[i][1] + dy * frac] as [number, number];
		}

		accumulated += segLen;
	}

	return coords[Math.floor(coords.length / 2)] as [number, number];
}
