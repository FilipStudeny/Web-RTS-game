import { Landmark, TreeDeciduous, ShieldPlus, XCircle, MousePointerSquareDashed } from "lucide-react";

import ActionButton from "@/components/ActionButton";

interface UnitType {
	type: string,
	name: string,
	icon: string,
}

interface EditorSidebarProps {
	scenarioName: string,
	setScenarioName: (value: string)=> void,
	playableAreaDrawn: boolean,
	drawType: "city" | "forest" | "unit" | null,
	setDrawType: (value: "city" | "forest" | "unit" | null)=> void,
	selectedUnitType: string | null,
	setSelectedUnitType: (value: string)=> void,
	selectedUnitSide: "ally" | "enemy",
	setSelectedUnitSide: (value: "ally" | "enemy")=> void,
	error: string | null,
	setError: (value: string | null)=> void,
	drawPlayableArea: ()=> void,
	deleteSelectedFeature: ()=> void,
	unitTypes: UnitType[],
}

export default function EditorSidebar({
	scenarioName,
	setScenarioName,
	playableAreaDrawn,
	drawType,
	setDrawType,
	selectedUnitType,
	setSelectedUnitType,
	selectedUnitSide,
	setSelectedUnitSide,
	error,
	drawPlayableArea,
	deleteSelectedFeature,
	unitTypes,
}: EditorSidebarProps) {
	return (
		<div className="w-1/3 h-full flex flex-col gap-4 p-4 bg-slate-900 shadow-inner overflow-hidden">
			<h2 className="text-2xl font-bold text-center border-b border-slate-700 pb-2">Scenario Editor</h2>

			<div className="flex flex-col gap-1">
				<label htmlFor="scenario-name" className="text-sm font-semibold text-slate-300">Scenario Name</label>
				<input
					id="scenario-name"
					type="text"
					value={scenarioName}
					onChange={(e) => setScenarioName(e.target.value)}
					className="bg-slate-800 text-slate-100 px-3 py-2 rounded border border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
					placeholder="Enter scenario name..."
				/>
			</div>

			{!playableAreaDrawn && (
				<>
					<p className="text-sm text-yellow-400 font-semibold text-center">
						Draw the playable area first (min 5×5 km).
					</p>
					<ActionButton
						onClick={drawPlayableArea}
						icon={<MousePointerSquareDashed className="w-5 h-5" />}
						className="bg-white/10 hover:bg-white/20"
					>
						Draw Playable Area
					</ActionButton>
					{error && <p className="text-xs text-red-500 text-center">{error}</p>}
				</>
			)}

			<ActionButton
				onClick={() => setDrawType("city")}
				disabled={!playableAreaDrawn}
				icon={<Landmark className="w-5 h-5" />}
				className="bg-orange-600 hover:bg-orange-700"
			>
				Mark City
			</ActionButton>

			<ActionButton
				onClick={() => setDrawType("forest")}
				disabled={!playableAreaDrawn}
				icon={<TreeDeciduous className="w-5 h-5" />}
				className="bg-green-700 hover:bg-green-800"
			>
				Mark Forest
			</ActionButton>

			<ActionButton
				onClick={() => setDrawType("unit")}
				disabled={!playableAreaDrawn}
				icon={<ShieldPlus className="w-5 h-5" />}
				className="bg-blue-700 hover:bg-blue-800"
			>
				Place Unit
			</ActionButton>

			{drawType === "unit" && (
				<>
					<select
						value={selectedUnitType ?? ""}
						onChange={(e) => setSelectedUnitType(e.target.value)}
						className="bg-slate-800 text-white rounded px-3 py-2 border border-slate-600"
					>
						<option value="" disabled>Select Unit Type</option>
						{unitTypes.map((u) => (
							<option key={u.type} value={u.icon}>{u.name}</option>
						))}
					</select>

					<div className="flex gap-2 items-center">
						<label className="text-sm text-slate-300 font-semibold">Side:</label>
						<select
							value={selectedUnitSide}
							onChange={(e) => setSelectedUnitSide(e.target.value as "ally" | "enemy")}
							className="bg-slate-800 text-white rounded px-3 py-2 border border-slate-600"
						>
							<option value="ally">Ally</option>
							<option value="enemy">Enemy</option>
						</select>
					</div>
				</>
			)}

			<ActionButton
				onClick={() => setDrawType(null)}
				disabled={!playableAreaDrawn}
				icon={<MousePointerSquareDashed className="w-5 h-5" />}
				className="bg-slate-600 hover:bg-slate-700"
			>
				Cancel Tool
			</ActionButton>

			<ActionButton
				onClick={deleteSelectedFeature}
				disabled={!playableAreaDrawn}
				icon={<XCircle className="w-5 h-5" />}
				className="bg-red-700 hover:bg-red-800"
			>
				Delete Selected
			</ActionButton>
		</div>
	);
}
