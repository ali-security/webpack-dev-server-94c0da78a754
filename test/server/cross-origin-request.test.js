"use strict";

const http = require("http");
const url = require("url");
const request = require("supertest");
const webpack = require("webpack");
const WebSocket = require("ws");
const Server = require("../../lib/Server");
const config = require("../fixtures/client-config/webpack.config");
const port = require("../ports-map")["cross-origin-request-option"];

const crossSiteNoCorsHeaders = {
  "Sec-Fetch-Mode": "no-cors",
  "Sec-Fetch-Site": "cross-site",
  "Sec-Fetch-Dest": "script",
};

describe("cross-origin request check", () => {
  describe('with the default "allowedHosts" option', () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server({ port }, compiler);

      await server.start();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
    });

    it("should return 403 for cross-site no-cors requests (e.g. '<script src>' from a malicious page)", async () => {
      const response = await req
        .get("/main.js")
        .set({ Host: `localhost:${port}`, ...crossSiteNoCorsHeaders })
        .buffer(true);

      expect(response.status).toEqual(403);
      expect(response.text).toEqual("Cross-Origin request blocked");
    });

    it("should return 403 for cross-site no-cors requests to an IP address host", async () => {
      const response = await req
        .get("/main.js")
        .set({ Host: `127.0.0.1:${port}`, ...crossSiteNoCorsHeaders })
        .buffer(true);

      expect(response.status).toEqual(403);
      expect(response.text).toEqual("Cross-Origin request blocked");
    });

    it("should return 403 for cross-site no-cors requests to other routes", async () => {
      const response = await req
        .get("/webpack-dev-server")
        .set({ Host: `localhost:${port}`, ...crossSiteNoCorsHeaders })
        .buffer(true);

      expect(response.status).toEqual(403);
      expect(response.text).toEqual("Cross-Origin request blocked");
    });

    it("should return 200 for same-origin no-cors requests", async () => {
      const response = await req.get("/main.js").set({
        Host: `localhost:${port}`,
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "same-origin",
      });

      expect(response.status).toEqual(200);
    });

    it("should return 200 for same-site no-cors requests", async () => {
      const response = await req.get("/main.js").set({
        Host: `localhost:${port}`,
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "same-site",
      });

      expect(response.status).toEqual(200);
    });

    it("should return 200 for cross-site cors requests", async () => {
      const response = await req.get("/main.js").set({
        Host: `localhost:${port}`,
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
      });

      expect(response.status).toEqual(200);
    });

    it("should return 200 for requests without fetch metadata headers", async () => {
      const response = await req
        .get("/main.js")
        .set({ Host: `localhost:${port}` });

      expect(response.status).toEqual(200);
    });
  });

  describe('with the "allowedHosts" option and the "all" value', () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server({ port, allowedHosts: "all" }, compiler);

      await server.start();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
    });

    it("should return 200 for cross-site no-cors requests", async () => {
      const response = await req
        .get("/main.js")
        .set({ Host: `localhost:${port}`, ...crossSiteNoCorsHeaders });

      expect(response.status).toEqual(200);
    });
  });

  describe('with the "allowedHosts" option and the "localhost" value', () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server({ port, allowedHosts: ["localhost"] }, compiler);

      await server.start();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
    });

    it("should return 200 for cross-site no-cors requests to an allowed host", async () => {
      const response = await req
        .get("/main.js")
        .set({ Host: `localhost:${port}`, ...crossSiteNoCorsHeaders });

      expect(response.status).toEqual(200);
    });

    it("should return 403 for cross-site no-cors requests to a host that is not explicitly allowed", async () => {
      const response = await req
        .get("/main.js")
        .set({ Host: `127.0.0.1:${port}`, ...crossSiteNoCorsHeaders })
        .buffer(true);

      expect(response.status).toEqual(403);
      expect(response.text).toEqual("Cross-Origin request blocked");
    });
  });

  describe('with the "allowedHosts" option and a subdomain wildcard value', () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server({ port, allowedHosts: [".example.com"] }, compiler);

      await server.start();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
    });

    it("should return 200 for cross-site no-cors requests to an allowed subdomain", async () => {
      const response = await req
        .get("/main.js")
        .set({ Host: `app.example.com:${port}`, ...crossSiteNoCorsHeaders });

      expect(response.status).toEqual(200);
    });

    it("should return 403 for cross-site no-cors requests to localhost", async () => {
      const response = await req
        .get("/main.js")
        .set({ Host: `localhost:${port}`, ...crossSiteNoCorsHeaders })
        .buffer(true);

      expect(response.status).toEqual(403);
      expect(response.text).toEqual("Cross-Origin request blocked");
    });
  });
});

// Browsers only send `Sec-Fetch-*` headers to potentially trustworthy origins,
// so a cross-site `<script src>` over plain HTTP arrives without them
// @see https://github.com/webpack/webpack-dev-server/security/advisories/GHSA-79cf-xcqc-c78w
describe("cross-origin resource policy header", () => {
  let server;
  let req;

  async function startServer(options) {
    const compiler = webpack(config);

    server = new Server({ port, ...options }, compiler);

    await server.start();

    req = request(server.app);
  }

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  it("should set 'Cross-Origin-Resource-Policy: same-origin' by default for requests without fetch metadata headers", async () => {
    await startServer({});

    const response = await req
      .get("/main.js")
      .set({ Host: `localhost:${port}` });

    expect(response.status).toEqual(200);
    expect(response.headers["cross-origin-resource-policy"]).toEqual(
      "same-origin"
    );
  });

  it("should set 'Cross-Origin-Resource-Policy: same-origin' for an IP address host", async () => {
    await startServer({ allowedHosts: "auto" });

    const response = await req
      .get("/main.js")
      .set({ Host: `127.0.0.1:${port}` });

    expect(response.status).toEqual(200);
    expect(response.headers["cross-origin-resource-policy"]).toEqual(
      "same-origin"
    );
  });

  it("should set 'Cross-Origin-Resource-Policy: same-origin' for built-in routes", async () => {
    await startServer({});

    const response = await req
      .get("/webpack-dev-server")
      .set({ Host: `localhost:${port}` });

    expect(response.status).toEqual(200);
    expect(response.headers["cross-origin-resource-policy"]).toEqual(
      "same-origin"
    );
  });

  it("should not set the 'Cross-Origin-Resource-Policy' header with the 'allowedHosts' option and the 'all' value", async () => {
    await startServer({ allowedHosts: "all" });

    const response = await req
      .get("/main.js")
      .set({ Host: `localhost:${port}` });

    expect(response.status).toEqual(200);
    expect(response.headers["cross-origin-resource-policy"]).toBeUndefined();
  });

  it("should not set the 'Cross-Origin-Resource-Policy' header for a host explicitly listed in the 'allowedHosts' option", async () => {
    await startServer({ allowedHosts: ["localhost"] });

    const response = await req
      .get("/main.js")
      .set({ Host: `localhost:${port}` });

    expect(response.status).toEqual(200);
    expect(response.headers["cross-origin-resource-policy"]).toBeUndefined();
  });

  it("should set the 'Cross-Origin-Resource-Policy' header for a host not listed in the 'allowedHosts' option", async () => {
    await startServer({ allowedHosts: ["localhost"] });

    const response = await req
      .get("/main.js")
      .set({ Host: `127.0.0.1:${port}` });

    expect(response.status).toEqual(200);
    expect(response.headers["cross-origin-resource-policy"]).toEqual(
      "same-origin"
    );
  });

  it("should not set the 'Cross-Origin-Resource-Policy' header with a wildcard 'Access-Control-Allow-Origin' header", async () => {
    await startServer({ headers: { "Access-Control-Allow-Origin": "*" } });

    const response = await req
      .get("/main.js")
      .set({ Host: `localhost:${port}` });

    expect(response.status).toEqual(200);
    expect(response.headers["access-control-allow-origin"]).toEqual("*");
    expect(response.headers["cross-origin-resource-policy"]).toBeUndefined();
  });

  it("should not set the 'Cross-Origin-Resource-Policy' header with a wildcard 'Access-Control-Allow-Origin' header in the array form", async () => {
    await startServer({
      headers: [{ key: "access-control-allow-origin", value: " * " }],
    });

    const response = await req
      .get("/main.js")
      .set({ Host: `localhost:${port}` });

    expect(response.status).toEqual(200);
    expect(response.headers["cross-origin-resource-policy"]).toBeUndefined();
  });

  it("should set the 'Cross-Origin-Resource-Policy' header with a specific-origin 'Access-Control-Allow-Origin' header", async () => {
    await startServer({
      headers: { "Access-Control-Allow-Origin": "http://foo.example.com" },
    });

    const response = await req
      .get("/main.js")
      .set({ Host: `localhost:${port}` });

    expect(response.status).toEqual(200);
    expect(response.headers["cross-origin-resource-policy"]).toEqual(
      "same-origin"
    );
  });

  it("should set the 'Cross-Origin-Resource-Policy' header when the 'headers' option is a function", async () => {
    await startServer({
      headers: () => {
        return { "Access-Control-Allow-Origin": "*" };
      },
    });

    const response = await req
      .get("/main.js")
      .set({ Host: `localhost:${port}` });

    expect(response.status).toEqual(200);
    expect(response.headers["cross-origin-resource-policy"]).toEqual(
      "same-origin"
    );
  });
});

// @see https://github.com/webpack/webpack-dev-server/security/advisories/GHSA-f5vj-f2hx-8m93
describe("cross-site request forgery on state-changing endpoints", () => {
  const endpoint = "/webpack-dev-server/invalidate";

  let server;
  let req;

  async function startServer(options) {
    const compiler = webpack(config);

    server = new Server({ port, ...options }, compiler);

    await server.start();

    req = request(server.app);
  }

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  it("should return 403 for cross-site cors requests (e.g. 'fetch()' from a malicious page)", async () => {
    await startServer({});

    const response = await req
      .get(endpoint)
      .set({
        Host: `localhost:${port}`,
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
      })
      .buffer(true);

    expect(response.status).toEqual(403);
    expect(response.text).toEqual("Cross-Origin request blocked");
  });

  it("should return 403 for same-site requests (e.g. a page on another localhost port)", async () => {
    await startServer({});

    const response = await req
      .get(endpoint)
      .set({
        Host: `localhost:${port}`,
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
      })
      .buffer(true);

    expect(response.status).toEqual(403);
    expect(response.text).toEqual("Cross-Origin request blocked");
  });

  it("should return 403 for cross-site no-cors requests to a host explicitly listed in the 'allowedHosts' option", async () => {
    await startServer({ allowedHosts: ["localhost"] });

    const response = await req
      .get(endpoint)
      .set({ Host: `localhost:${port}`, ...crossSiteNoCorsHeaders })
      .buffer(true);

    expect(response.status).toEqual(403);
    expect(response.text).toEqual("Cross-Origin request blocked");
  });

  it("should return 403 for requests with a cross-origin 'Origin' header and no fetch metadata headers", async () => {
    await startServer({});

    const response = await req
      .get(endpoint)
      .set({ Host: `localhost:${port}`, Origin: "http://evil.example" })
      .buffer(true);

    expect(response.status).toEqual(403);
    expect(response.text).toEqual("Cross-Origin request blocked");
  });

  it("should return 200 for same-origin requests", async () => {
    await startServer({});

    const response = await req.get(endpoint).set({
      Host: `localhost:${port}`,
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
    });

    expect(response.status).toEqual(200);
  });

  it("should return 200 for user-initiated navigations", async () => {
    await startServer({});

    const response = await req.get(endpoint).set({
      Host: `localhost:${port}`,
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
    });

    expect(response.status).toEqual(200);
  });

  it("should return 200 for requests with a same-origin 'Origin' header and no fetch metadata headers", async () => {
    await startServer({});

    const response = await req.get(endpoint).set({
      Host: `localhost:${port}`,
      Origin: `http://localhost:${port}`,
    });

    expect(response.status).toEqual(200);
  });

  it("should return 200 for requests without fetch metadata or 'Origin' headers (e.g. curl)", async () => {
    await startServer({});

    const response = await req.get(endpoint).set({ Host: `localhost:${port}` });

    expect(response.status).toEqual(200);
  });
});

// A malformed `Host`/`Origin` header value used to make `url.parse()` throw
// while being validated; on the WebSocket upgrade path the exception escaped
// as an uncaught exception and took down the whole dev server process
describe("malformed 'Host' and 'Origin' header values", () => {
  // `[::1` is an invalid IPv6 literal; a soft hyphen (U+00AD) is removed by
  // IDNA mapping, leaving an empty hostname that newer Node.js versions reject
  // with `ERR_INVALID_URL` (it is latin-1, so it survives a real HTTP header)
  const malformedHosts = [
    ["an invalid IPv6 literal", "[::1"],
    ["a soft hyphen", "­"],
  ];
  const malformedOrigins = [
    ["an invalid IPv6 literal", "http://[::1/"],
    ["a soft hyphen", "http://­"],
  ];
  const webSocketCases = [
    ...malformedHosts.map(([name, host]) => [
      `a 'Host' header with ${name}`,
      { host, origin: `http://localhost:${port}` },
    ]),
    ...malformedOrigins.map(([name, origin]) => [
      `an 'Origin' header with ${name}`,
      { host: `localhost:${port}`, origin },
    ]),
  ];

  function isMalformed(value) {
    return (
      typeof value === "string" &&
      (value.includes("­") || /\[::1(?!\])/.test(value))
    );
  }

  describe.each([
    ["as parsed by the running Node.js version", false],
    ["when 'url.parse()' throws on them (as newer Node.js versions do)", true],
  ])("%s", (_title, simulateParseError) => {
    let server;
    let parseSpy;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server({ port, allowedHosts: "auto" }, compiler);

      await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    beforeEach(() => {
      if (simulateParseError) {
        const originalParse = url.parse;

        parseSpy = jest.spyOn(url, "parse").mockImplementation((...args) => {
          if (isMalformed(args[0])) {
            throw new TypeError(`Invalid URL: ${args[0]}`);
          }

          return originalParse(...args);
        });
      }
    });

    afterEach(() => {
      if (parseSpy) {
        parseSpy.mockRestore();
        parseSpy = null;
      }
    });

    it.each(malformedHosts)(
      "should reject a 'Host' header with %s",
      (_name, host) => {
        expect(server.checkHeader({ host }, "host", true)).toBe(false);
        expect(server.checkHeader({ host }, "host", false, false)).toBe(false);
        expect(
          server.isSameOrigin({ host, origin: `http://localhost:${port}` })
        ).toBe(false);
      }
    );

    it.each(malformedOrigins)(
      "should reject an 'Origin' header with %s",
      (_name, origin) => {
        const headers = { host: `localhost:${port}`, origin };

        expect(server.isSameOrigin(headers)).toBe(false);
        expect(server.checkHeader(headers, "origin", false)).toBe(false);
        expect(server.isSameOriginRequest({ headers })).toBe(false);
      }
    );

    it.each(malformedHosts)(
      "should respond with 'Invalid Host header' to a request with a 'Host' header with %s",
      async (_name, host) => {
        const response = await request(server.app)
          .get("/main.js")
          .set({ Host: host })
          .buffer(true);

        expect(response.status).toEqual(200);
        expect(response.text).toEqual("Invalid Host header");
      }
    );

    it.each(webSocketCases)(
      "should close a WebSocket connection with %s and keep running",
      async (_name, headers) => {
        const messages = await new Promise((resolve) => {
          const received = [];
          const ws = new WebSocket(`ws://localhost:${port}/ws`, { headers });
          // never wait forever for the server to close the connection
          const timeout = setTimeout(() => {
            ws.terminate();
          }, 10000);

          ws.on("message", (data) => {
            received.push(JSON.parse(data.toString()));
          });
          ws.on("close", () => {
            clearTimeout(timeout);
            resolve(received);
          });
          ws.on("error", () => {
            clearTimeout(timeout);
            resolve(received);
          });
        });

        expect(messages).toEqual([
          { type: "error", data: "Invalid Host/Origin header" },
        ]);

        // the dev server process is still alive and serving requests
        const status = await new Promise((resolve, reject) => {
          http
            .get(`http://localhost:${port}/main.js`, (res) => {
              res.resume();
              resolve(res.statusCode);
            })
            .on("error", reject);
        });

        expect(status).toEqual(200);
      }
    );
  });
});
