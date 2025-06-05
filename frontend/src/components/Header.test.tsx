import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";

// 🧠 Mock the Link component from TanStack Router
vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children, className }: { to: string, children: React.ReactNode, className?: string }) => (
		<a href={to} className={className}>
			{children}
		</a>
	),
}));

import Header from "./Header";

describe("Header", () => {
	it("renders navigation links and user ID", () => {
		render(<Header />);

		const homeLink = screen.getByText("Home");
		const editorLink = screen.getByText("Editor");
		const userIdText = screen.getByText(/ID: User-452A/i);

		expect(homeLink).toBeInTheDocument();
		expect(editorLink).toBeInTheDocument();
		expect(userIdText).toBeInTheDocument();

		expect(homeLink.closest("a")).toHaveAttribute("href", "/");
		expect(editorLink.closest("a")).toHaveAttribute("href", "/editor");
	});
});
