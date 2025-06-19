import { useNavigate } from "@tanstack/react-router";
import Feature from "ol/Feature";
import Map from "ol/Map";
import View from "ol/View";
import ScaleLine from "ol/control/ScaleLine";
import { Polygon } from "ol/geom";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { Style, Stroke } from "ol/style";
import { useEffect, useRef, useState } from "react";

import { useJoinSession } from "@/actions/sessions/joinSession";
import { useSocketStore } from "@/integrations/stores/useSocketStore";

interface Props {
	session: {
		sessionId: string,
		scenarioId: string,
		player1: string,
		player2?: string,
		state: string,
	},
	clearSelection: ()=> void,
}

const scenarioBounds: Record<string, [number, number, number, number]> = {
	"Desert Assault": [-1300000, 1900000, -1100000, 2100000],
	"Arctic Conflict": [2000000, 9500000, 4000000, 10500000],
	"Urban Siege": [1490000, 6890000, 1498000, 6898000],
};

export default function SelectedSessionPanel({ session, clearSelection }: Props) {
	const mapRef = useRef<HTMLDivElement | null>(null);
	const mapInstance = useRef<Map | null>(null);

	const { userId, sessionReady, gameStartedSessionId } = useSocketStore();
	const { mutateAsync: joinSession, isPending, error } = useJoinSession();
	const navigate = useNavigate();
	const [hasJoined, setHasJoined] = useState(false);
	useEffect(() => {
		if (!mapRef.current) return;

		if (mapInstance.current) {
			mapInstance.current.setTarget(undefined);
			mapInstance.current = null;
		}

		const view = new View({ center: [0, 0], zoom: 2 });
		const scaleLine = new ScaleLine({ units: "metric", minWidth: 64 });

		mapInstance.current = new Map({
			target: mapRef.current,
			interactions: [],
			controls: [scaleLine],
			layers: [new TileLayer({ source: new OSM() })],
			view,
		});

		const extent = scenarioBounds[session.scenarioId];
		if (extent) {
			view.fit(extent, { padding: [20, 20, 20, 20] });

			const boundary = new Feature(
				new Polygon([
					[
						[extent[0], extent[1]],
						[extent[0], extent[3]],
						[extent[2], extent[3]],
						[extent[2], extent[1]],
						[extent[0], extent[1]],
					],
				]),
			);

			const vector = new VectorLayer({
				source: new VectorSource({ features: [boundary] }),
				style: new Style({
					stroke: new Stroke({ color: "red", width: 2 }),
				}),
			});

			mapInstance.current.addLayer(vector);
		}
	}, [session]);

	const handleJoin = async () => {
		if (!userId) return;

		try {
			await joinSession({
				sessionId: session.sessionId,
				userId,
			});
			setHasJoined(true);
		} catch (err) {
			console.error("Failed to join session", err);
		}
	};

	useEffect(() => {
		if (sessionReady?.sessionId === session.sessionId) {
			navigate({ to: "/session/$sessionId", params: { sessionId: session.sessionId } });
		}
	}, [sessionReady, session.sessionId]);

	useEffect(() => {
		if (gameStartedSessionId === session.sessionId) {
			navigate({ to: "/session/$sessionId", params: { sessionId: session.sessionId } });
		}
	}, [gameStartedSessionId, session.sessionId]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-bold">Session {session.sessionId}</h2>
				<button onClick={clearSelection} className="text-sm text-gray-400 hover:text-white">
					Clear
				</button>
			</div>

			{hasJoined ? (
				<div className="p-4 border border-green-500 rounded text-green-300 bg-green-900/20">
					<p className="text-sm mb-1">Successfully joined the session!</p>
					<p className="font-mono text-lg">ID: {session.sessionId}</p>

					{gameStartedSessionId === session.sessionId ? (
						<p className="text-sm text-blue-300 mt-2">🎮 Game is starting...</p>
					) : (
						<p className="text-sm mt-2">Waiting for host to start the game...</p>
					)}
				</div>
			) : (
				<>
					<p className="text-gray-300 text-sm">Scenario: {session.scenarioId}</p>

					<label className="text-sm">Map Preview:</label>
					<div ref={mapRef} className="w-full aspect-[4/3] rounded border border-gray-600 overflow-hidden" />

					<label className="text-sm">Players in Game:</label>
					<ul className="bg-gray-700 p-2 rounded text-sm">
						{[session.player1, session.player2].filter(Boolean).map((p) => (
							<li key={p} className="py-1 border-b border-gray-600 last:border-b-0">
								{p}
							</li>
						))}
					</ul>

					{error && (
						<p className="text-sm text-red-500">Could not join session. Try again later.</p>
					)}

					<button
						onClick={handleJoin}
						disabled={isPending || !userId}
						className="mt-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-semibold text-center disabled:opacity-50"
					>
						{isPending ? "Joining..." : "Join Session"}
					</button>
				</>
			)}
		</div>
	);

}
