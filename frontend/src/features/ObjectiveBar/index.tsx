import Map from "ol/Map";
import { fromLonLat } from "ol/proj";

export type Objective = {
	letter: string,
	state: "neutral" | "capturing" | "captured",
	position: [number, number], // [lon, lat]
};

type ObjectiveBarProps = {
	objectives: Objective[],
	map: Map | null,
};

function getCircleClasses(state: Objective["state"]) {
	switch (state) {
		case "neutral":
			return "border-gray-500 bg-gray-700 text-gray-200";
		case "capturing":
			return "border-amber-400 bg-gray-700 text-amber-300 animate-pulse";
		case "captured":
			return "border-emerald-400 bg-emerald-600 text-white";
		default:
			return "";
	}
}

export function ObjectiveBar({ objectives, map }: ObjectiveBarProps) {
	function centerMapOn(pos: [number, number]) {
		if (!map) return;
		map.getView().animate({ center: fromLonLat(pos), duration: 500 });
	}

	return (
		<div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex items-center z-50">
			{objectives.map((obj, idx) => (
				<div key={obj.letter} className="flex items-center">
					<div
						onClick={() => centerMapOn(obj.position)}
						className={`
							w-8 h-8 rounded-full flex items-center justify-center
							border-2 cursor-pointer
							${getCircleClasses(obj.state)}
						`}
					>
						<span className="text-sm font-semibold">{obj.letter}</span>
					</div>
					{idx < objectives.length - 1 && (
						<div className="flex items-center justify-center space-x-1 mx-2">
							{[0, 1, 2, 3].map((i) => (
								<div key={i} className="w-1 h-1 bg-gray-500 rounded-full" />
							))}
						</div>
					)}
				</div>
			))}
		</div>
	);
}
