// src/components/ChatPanel.tsx
import { useEffect, useState } from "react";

import { Panel } from "@/components/Panel";

type ChatPanelProps = {
	open: boolean,
	setOpen: (val: boolean)=> void,
};

export function ChatPanel({ open, setOpen }: ChatPanelProps) {
	const [chatMessages, setChatMessages] = useState<string[]>([]);
	const [chatInput, setChatInput] = useState("");
	const [unread, setUnread] = useState(false);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				if (!open) {
					setOpen(true);
					setUnread(false);
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);

		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [open]);

	const sendChat = () => {
		if (chatInput.trim()) {
			setChatMessages((prev) => [...prev, `You: ${chatInput}`]);
			setChatInput("");
			if (!open) setUnread(true);
		}
	};

	if (open) {
		return (
			<Panel
				title="Chat"
				className="absolute bottom-0 right-0 m-4 w-80 h-64 flex flex-col z-40"
				onClose={() => setOpen(false)}
				noTransition
			>

				<div className="relative h-full flex flex-col">
					{/* Messages area: grows, scrolls, and has pb-12 so it never hides behind the input */}
					<div className="flex-1 overflow-y-auto space-y-1 pr-1 pb-12">
						{chatMessages.map((msg, idx) => (
							<p key={idx} className="text-sm bg-slate-700/50 p-1 rounded text-white">
								{msg}
							</p>
						))}
					</div>

					<div className="absolute bottom-0 left-0 right-0 flex bg-gray-800/90 p-1">
						<input
							type="text"
							value={chatInput}
							onChange={(e) => setChatInput(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && sendChat()}
							placeholder="Type message..."
							className="flex-1 px-3 py-2 bg-slate-800 text-white rounded-l outline-none text-xs"
							autoFocus
						/>
						<button
							onClick={sendChat}
							className="bg-blue-600 hover:bg-blue-700 px-3 rounded-r text-white text-xs"
						>
							Send
						</button>
					</div>
				</div>
			</Panel>
		);
	}

	return (
		<Panel className="absolute bottom-4 right-4 w-48 px-0 py-0 z-50" noClose>
			<div className="flex items-center">
				<input
					type="text"
					readOnly
					value={unread ? "New message…" : "Click to chat"}
					onClick={() => {
						setOpen(true);
						setUnread(false);
					}}
					className="
						w-full
						px-2 py-1
						bg-slate-800 text-white
						rounded-lg
						text-xs
						cursor-pointer
						focus:outline-none
					"
				/>
			</div>
		</Panel>
	);
}
