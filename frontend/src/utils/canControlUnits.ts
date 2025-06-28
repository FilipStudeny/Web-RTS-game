import type { SessionSummary } from "@/actions/proto/game_session";

import { Unit, UnitSide } from "@/actions/proto/scenario";

export function canControlUnit(unit: Unit, userId: string, session: SessionSummary): boolean {
	if (unit.side === UnitSide.BLUE) return userId === session.player1;
	if (unit.side === UnitSide.RED) return userId === session.player2;

	return false;
}
