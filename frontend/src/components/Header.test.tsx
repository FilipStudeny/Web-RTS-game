import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom";

// 🧠 Mock Link before importing Header
vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children }: { to: string, children: React.ReactNode }) => (
		<a href={to}>{children}</a>
	),
}));

import Header from "./Header";

describe("Header", () => {
	it("renders navigation links", () => {
		render(<Header />);

		expect(screen.getByText("Home")).toBeInTheDocument();
		expect(screen.getByText("TanStack Query")).toBeInTheDocument();
		expect(screen.getByText("Home").closest("a")).toHaveAttribute("href", "/");
		expect(screen.getByText("TanStack Query").closest("a")).toHaveAttribute("href", "/demo/tanstack-query");
	});
});
