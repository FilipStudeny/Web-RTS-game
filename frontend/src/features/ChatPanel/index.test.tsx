import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, it, expect, beforeEach } from "vitest";

import { ChatPanel } from "../ChatPanel";

function Wrapper() {
	const [open, setOpen] = useState(false);

	return <ChatPanel open={open} setOpen={setOpen} />;
}

describe("ChatPanel", () => {
	beforeEach(() => {
		document.body.innerHTML = ""; // clear DOM
	});

	it("renders minimized chat with 'Click to chat' initially", () => {
		render(<Wrapper />);
		expect(screen.getByDisplayValue("Click to chat")).toBeInTheDocument();
	});

	it("opens the panel when clicked", async () => {
		render(<Wrapper />);
		const input = screen.getByDisplayValue("Click to chat");
		await userEvent.click(input);
		expect(screen.getByPlaceholderText("Type message...")).toBeInTheDocument();
	});

	it("allows typing and sending a message", async () => {
		render(<Wrapper />);
		await userEvent.click(screen.getByDisplayValue("Click to chat"));

		const input = screen.getByPlaceholderText("Type message...");
		await userEvent.type(input, "Hello!");
		await userEvent.click(screen.getByText("Send"));

		expect(screen.getByText("You: Hello!")).toBeInTheDocument();
	});

	it("sends message on Enter key", async () => {
		render(<Wrapper />);
		await userEvent.click(screen.getByDisplayValue("Click to chat"));

		const input = screen.getByPlaceholderText("Type message...");
		await userEvent.type(input, "Hi there{enter}");

		expect(screen.getByText("You: Hi there")).toBeInTheDocument();
	});

	it("opens chat panel on pressing Enter key if closed", () => {
		render(<Wrapper />);
		fireEvent.keyDown(window, { key: "Enter" });
		expect(screen.getByPlaceholderText("Type message...")).toBeInTheDocument();
	});
});
