import { useEffect, useRef, useState } from "react";

export function useLoadingMessages(active: boolean): [string, boolean] {
	const [message, setMessage] = useState("");
	const [visible, setVisible] = useState(true);
	const intervalRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		const messages = [
			"Establishing command channels...",
			"Deploying units to strategic positions...",
			"Drawing battle lines...",
			"Uploading tactical data...",
			"Securing map zones...",
			"Synchronizing with HQ...",
			"Finalizing mission parameters...",
			"Encrypting communication...",
			"Fueling tanks and loading weapons...",
			"Calibrating targeting systems...",
		];

		if (active) {
			setMessage(messages[Math.floor(Math.random() * messages.length)]);

			intervalRef.current = setInterval(() => {
				setVisible(false);
				setTimeout(() => {
					const msg = messages[Math.floor(Math.random() * messages.length)];
					setMessage(msg);
					setVisible(true);
				}, 300);
			}, 2500);
		} else {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		}

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
			}
		};
	}, [active]);

	return [message, visible];
}
