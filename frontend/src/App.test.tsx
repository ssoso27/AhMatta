import { render, screen } from "@testing-library/react";

import { App } from "./App";

test("shows the product purpose", () => {
    render(<App />);

    expect(
        screen.getByRole("heading", { name: "지금 뭐 하고 있었지?" }),
    ).toBeVisible();
});
