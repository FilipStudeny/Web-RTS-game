import { render, act } from "@testing-library/react";
import { vi } from "vitest";

import type { Objective } from "../ObjectiveBar";
import type { Unit } from "../UnitDetailPanel";

import { GameMap } from "@/features/GameMap";

const addInteraction = vi.fn();
const removeInteraction = vi.fn();
const addLayer = vi.fn();
const setTarget = vi.fn();
const getTargetElement = vi.fn(() => document.createElement("div"));

// --- Mocks ---
vi.mock("ol/sphere", async () => {
	const actual = await vi.importActual<typeof import("ol/sphere")>("ol/sphere");

	return {
		...actual,
		getLength: vi.fn(() => 100),
	};
});

vi.mock("ol/Map", () => ({
	default: vi.fn().mockImplementation(() => ({
		addInteraction,
		removeInteraction,
		addLayer,
		setTarget,
		getTargetElement,
		getView: vi.fn(() => ({
			setCenter: vi.fn(),
			setZoom: vi.fn(),
		})),
	})),
}));

vi.mock("ol/source/Vector", () => {
	return {
		default: vi.fn().mockImplementation(() => ({
			clear: vi.fn(),
			addFeatures: vi.fn(),
			addFeature: vi.fn(),
			removeFeature: vi.fn(),
		})),
	};
});

vi.mock("ol/layer/Vector", () => {
	return {
		default: vi.fn().mockImplementation(() => ({
			setStyle: vi.fn(),
			getSource: vi.fn(),
		})),
	};
});

// --- Test data ---
const mockUnitData: Unit = {
	id: "u1",
	name: "Mock Unit",
	health: 100,
	accuracy: 80,
	sightRange: 250,
	movementSpeed: 40,
	position: [0, 0],
	type: "infantry",
	side: "friendly",
};

const mockObjectives: Objective[] = [
	{ letter: "A", state: "captured", position: [0, 0] },
	{ letter: "B", state: "capturing", position: [1, 1] },
];

// --- Tests ---
describe("GameMap", () => {
	it("renders map container", async () => {
		await act(() =>
			render(
				<GameMap
					units={[mockUnitData]}
					objectives={mockObjectives}
					measureActive={false}
					onSelectUnit={() => {}}
				/>,
			),
		);

		const mapElement = document.querySelector(".absolute.inset-0.z-0");
		expect(mapElement).toBeInTheDocument();
	});

	it("calls setMapInstance if provided", async () => {
		const setMapInstance = vi.fn();

		await act(() =>
			render(
				<GameMap
					units={[mockUnitData]}
					objectives={mockObjectives}
					measureActive={false}
					onSelectUnit={() => {}}
					setMapInstance={setMapInstance}
				/>,
			),
		);

		expect(setMapInstance).toHaveBeenCalledTimes(1);
	});
});
