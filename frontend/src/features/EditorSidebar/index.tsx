import {
	Landmark,
	TreeDeciduous,
	ShieldPlus,
	XCircle,
	MousePointerSquareDashed,
	Target,
	CheckCircle,
} from "lucide-react";
import { useState } from "react";

import type { UnitType, UnitTypeKey } from "@/actions/proto/unit_Types";

import ActionButton from "@/components/ActionButton";

type UnitSide = "ally" | "enemy";

interface AreaType {
	name: string,
	color: string,
}

interface EditorSidebarProps {
	scenarioName: string,
	setScenarioName: (value: string)=> void,
	drawType: string | null,
	setDrawType: (value: string | null)=> void,
	selectedUnitType: UnitTypeKey | null,
	setSelectedUnitType: (value: UnitTypeKey)=> void,
	selectedUnitSide: UnitSide,
	setSelectedUnitSide: (value: UnitSide)=> void,
	deleteSelectedFeature: ()=> void,
	unitTypes: UnitType[],
	areaTypes: AreaType[],
	canCreateScenario: boolean,
	onCreateScenario: ()=> void,
}

const getIconForArea = (name: string) => {
	switch (name.toLowerCase()) {
		case "forest":
			return <TreeDeciduous className="w-5 h-5" />;
		case "city":
			return <Landmark className="w-5 h-5" />;
		default:
			return <Landmark className="w-5 h-5" />;
	}
};

export default function EditorSidebar({
	scenarioName,
	setScenarioName,
	drawType,
	setDrawType,
	selectedUnitType,
	setSelectedUnitType,
	selectedUnitSide,
	setSelectedUnitSide,
	deleteSelectedFeature,
	unitTypes,
	areaTypes,
	canCreateScenario,
	onCreateScenario,
}: EditorSidebarProps) {
	const [query, setQuery] = useState("");
	const [isOpen, setIsOpen] = useState(false);

	const filteredUnits =
		query === ""
			? unitTypes
			: unitTypes.filter((u) =>
				u.name.toLowerCase().includes(query.toLowerCase()),
			);

	const handleSelect = (type: UnitTypeKey) => {
		setSelectedUnitType(type);
		setQuery("");
		setIsOpen(false);
	};

	const selectedUnit = unitTypes.find((u) => u.type === selectedUnitType);
	const selectedUnitName = selectedUnit?.name || "";

	return (
		<div className="w-1/3 h-full flex flex-col gap-4 p-4 bg-slate-900 shadow-inner overflow-hidden">
			<h2 className="text-2xl font-bold text-center border-b border-slate-700 pb-2">
				Scenario Editor
			</h2>

			<div className="flex flex-col gap-1">
				<label htmlFor="scenario-name" className="text-sm font-semibold text-slate-300">
					Scenario Name
				</label>
				<input
					id="scenario-name"
					type="text"
					value={scenarioName}
					onChange={(e) => setScenarioName(e.target.value)}
					className="bg-slate-800 text-slate-100 px-3 py-2 rounded border border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
					placeholder="Enter scenario name..."
				/>
			</div>

			<div className="flex flex-wrap gap-2">
				{areaTypes.map((area) => (
					<ActionButton
						key={area.name}
						onClick={() => setDrawType(area.name.toLowerCase())}
						icon={getIconForArea(area.name)}
						className="hover:brightness-110 min-w-[120px]"
						style={{ backgroundColor: area.color }}
					>
						{area.name.charAt(0).toUpperCase() + area.name.slice(1)}
					</ActionButton>
				))}
			</div>

			<ActionButton
				onClick={() => setDrawType(drawType === "unit" ? null : "unit")}
				icon={<ShieldPlus className="w-5 h-5" />}
				className={`${
					drawType === "unit" ? "bg-blue-800" : "bg-blue-700 hover:bg-blue-800"
				}`}
			>
				Place Unit
			</ActionButton>

			{drawType === "unit" && (
				<div className="space-y-2 relative">
					<div className="relative" onBlur={() => setTimeout(() => setIsOpen(false), 100)}>
						<input
							type="text"
							className="w-full bg-slate-800 text-white rounded px-3 py-2 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
							placeholder="Search unit..."
							value={isOpen ? query : selectedUnitName}
							onFocus={() => setIsOpen(true)}
							onChange={(e) => {
								setQuery(e.target.value);
								setIsOpen(true);
							}}
						/>
						<button
							type="button"
							className="absolute inset-y-0 right-0 flex items-center pr-2"
							onClick={() => setIsOpen(!isOpen)}
						>
							<MousePointerSquareDashed className="w-5 h-5 text-slate-400" />
						</button>

						{isOpen && (
							<ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-slate-800 py-1 text-base border border-slate-600">
								{filteredUnits.length > 0 ? (
									filteredUnits.map((u) => (
										<li
											key={u.type}
											className="cursor-pointer px-4 py-2 hover:bg-slate-700 hover:text-white text-slate-300 flex items-center gap-2"
											onMouseDown={() => handleSelect(u.type)}
										>
											<img
												src={`/images/units/${u.icon.toLowerCase()}.png`}
												alt={u.name}
												className="w-6 h-6 object-contain"
											/>
											<span>{u.name}</span>
										</li>
									))
								) : (
									<li className="px-4 py-2 text-slate-500">No units found.</li>
								)}
							</ul>
						)}
					</div>

					<div className="flex gap-2 items-center">
						<label className="text-sm text-slate-300 font-semibold">Side:</label>
						<select
							value={selectedUnitSide}
							onChange={(e) =>
								setSelectedUnitSide(e.target.value as UnitSide)
							}
							className="bg-slate-800 text-white rounded px-3 py-2 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
						>
							<option value="ally">Ally</option>
							<option value="enemy">Enemy</option>
						</select>
					</div>
				</div>
			)}

			<ActionButton
				onClick={() => setDrawType("objective")}
				icon={<Target className="w-5 h-5" />}
				className="bg-purple-600 hover:bg-purple-700"
			>
				Add Objective
			</ActionButton>

			<ActionButton
				onClick={() => setDrawType(null)}
				icon={<MousePointerSquareDashed className="w-5 h-5" />}
				className="bg-slate-600 hover:bg-slate-700"
			>
				Cancel Tool
			</ActionButton>

			<ActionButton
				onClick={deleteSelectedFeature}
				icon={<XCircle className="w-5 h-5" />}
				className="bg-red-700 hover:bg-red-800"
			>
				Delete Selected
			</ActionButton>

			<ActionButton
				onClick={onCreateScenario}
				disabled={!canCreateScenario}
				icon={<CheckCircle className="w-5 h-5" />}
				className={`mt-auto ${
					canCreateScenario
						? "bg-green-600 hover:bg-green-700"
						: "bg-green-900 opacity-50 cursor-not-allowed"
				}`}
			>
				Create Scenario
			</ActionButton>
		</div>
	);
}
