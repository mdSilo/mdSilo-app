import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CorsProxySetting } from "./CorsProxySetting";

let siteProxy = "/__cors_proxy__?url={url}";
vi.mock("@/host/web/feed", () => ({
  PUBLIC_CORS_PROXY: "https://api.allorigins.win/raw?url={url}",
  defaultCorsProxy: async () => siteProxy,
}));

describe("CorsProxySetting", () => {
  beforeEach(() => localStorage.clear());

  it("loads and saves the proxy; says it is in use", async () => {
    localStorage.setItem("cors_proxy", JSON.stringify("https://old.com/"));
    render(<CorsProxySetting />);
    const input = screen.getByLabelText("CORS Proxy");
    await waitFor(() =>
      expect((input as HTMLInputElement).value).toBe("https://old.com/"),
    );
    expect(screen.getByTestId("cors-proxy-status").textContent).toBe(
      "In use: your proxy, for feeds and AI.",
    );
    await userEvent.clear(input);
    await userEvent.type(input, "https://p.com/?url={{url}{enter}");
    expect(JSON.parse(localStorage.getItem("cors_proxy") ?? '""')).toBe(
      "https://p.com/?url={url}",
    );
    await userEvent.clear(input);
    await userEvent.type(input, "none{enter}");
    expect(screen.getByTestId("cors-proxy-status").textContent).toMatch(
      /No proxy/,
    );
  });

  it("empty: the proxy this site has, in use", async () => {
    siteProxy = "https://site-proxy.workers.dev/?url={url}";
    render(<CorsProxySetting />);
    await waitFor(() =>
      expect(screen.getByTestId("cors-proxy-status").textContent).toContain(
        "This site has a proxy already, in use for feeds and AI: https://site-proxy.workers.dev/?url={url}",
      ),
    );
  });

  it("empty, and the site has none: the public one for feeds only", async () => {
    siteProxy = "https://api.allorigins.win/raw?url={url}";
    render(<CorsProxySetting />);
    await waitFor(() =>
      expect(screen.getByTestId("cors-proxy-status").textContent).toMatch(
        /no proxy of its own.*the AI never uses it/,
      ),
    );
  });
});
