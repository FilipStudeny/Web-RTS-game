export type ObjectiveState = "neutral" | "capturing" | "captured";

export const OBJECTIVE_STATE_STYLE_MAP: Record<ObjectiveState, {
	fill: string,
	stroke: string,
	text: string,
}> = {
	neutral: {
		fill: "#374151",
		stroke: "#6B7280",
		text: "#D1D5DB",
	},
	capturing: {
		fill: "#374151",
		stroke: "#FBBF24",
		text: "#FCD34D",
	},
	captured: {
		fill: "#047857",
		stroke: "#10B981",
		text: "#ffffff",
	},
};
