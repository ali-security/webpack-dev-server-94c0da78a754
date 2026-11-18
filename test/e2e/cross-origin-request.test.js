"use strict";

const http = require("http");
const net = require("net");
const url = require("url");
const webpack = require("webpack");
const WebSocket = require("ws");
const Server = require("../../lib/Server");
const config = require("../fixtures/client-config/webpack.config");
const runBrowser = require("../helpers/run-browser");
const [port1, port2] = require("../ports-map")["cross-origin-request"];

describe("cross-origin requests", () => {
  const devServerPort = port1;
  const htmlServerPort = port2;
  const htmlServerHost = "127.0.0.1";

  it("should return 403 for cross-origin no-cors non-module script tag requests", async () => {
    const compiler = webpack(config);
    const devServerOptions = {
      port: devServerPort,
      allowedHosts: "auto",
    };
    const server = new Server(devServerOptions, compiler);

    await server.start();

    // Start a separate server for serving the HTML file
    const htmlServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <html>
          <head>
            <script src="http://localhost:${devServerPort}/main.js"></script>
          </head>
          <body></body>
        </html>
      `);
    });
    htmlServer.listen(htmlServerPort, htmlServerHost);

    const { page, browser } = await runBrowser();

    try {
      const pageErrors = [];

      page.on("pageerror", (error) => {
        pageErrors.push(error);
      });

      const scriptTagRequest = page.waitForResponse(
        `http://localhost:${devServerPort}/main.js`
      );

      await page.goto(`http://${htmlServerHost}:${htmlServerPort}`);

      const response = await scriptTagRequest;

      expect(response.status()).toBe(403);
    } finally {
      await browser.close();
      await server.stop();
      htmlServer.close();
    }
  });

  it("should return 200 for cross-origin cors non-module script tag requests", async () => {
    const compiler = webpack(config);
    const devServerOptions = {
      port: devServerPort,
      allowedHosts: "auto",
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    };
    const server = new Server(devServerOptions, compiler);

    await server.start();

    // Start a separate server for serving the HTML file
    const htmlServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <html>
          <head>
            <script src="http://localhost:${devServerPort}/main.js" crossorigin></script>
          </head>
          <body></body>
        </html>
      `);
    });
    htmlServer.listen(htmlServerPort, htmlServerHost);

    const { page, browser } = await runBrowser();

    try {
      const pageErrors = [];

      page.on("pageerror", (error) => {
        pageErrors.push(error);
      });

      const scriptTagRequest = page.waitForResponse(
        `http://localhost:${devServerPort}/main.js`
      );

      await page.goto(`http://${htmlServerHost}:${htmlServerPort}`);

      const response = await scriptTagRequest;

      expect(response.status()).toBe(200);
    } finally {
      await browser.close();
      await server.stop();
      htmlServer.close();
    }
  });

  it("should return 200 for cross-origin no-cors non-module script tag requests with the 'allowedHost' option and 'all' value", async () => {
    const compiler = webpack(config);
    const devServerOptions = {
      port: devServerPort,
      allowedHosts: "all",
    };
    const server = new Server(devServerOptions, compiler);

    await server.start();

    // Start a separate server for serving the HTML file
    const htmlServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <html>
          <head>
            <script src="http://localhost:${devServerPort}/main.js"></script>
          </head>
          <body></body>
        </html>
      `);
    });
    htmlServer.listen(htmlServerPort, htmlServerHost);

    const { page, browser } = await runBrowser();

    try {
      const pageErrors = [];

      page.on("pageerror", (error) => {
        pageErrors.push(error);
      });

      const scriptTagRequest = page.waitForResponse(
        `http://localhost:${devServerPort}/main.js`
      );

      await page.goto(`http://${htmlServerHost}:${htmlServerPort}`);

      const response = await scriptTagRequest;

      expect(response.status()).toBe(200);
    } finally {
      await browser.close();
      await server.stop();
      htmlServer.close();
    }
  });

  it("should return 200 for cross-origin no-cors non-module script tag requests with the `allowedHost` option and the `localhost` value", async () => {
    const compiler = webpack(config);
    const devServerOptions = {
      port: devServerPort,
      allowedHosts: ["localhost"],
    };
    const server = new Server(devServerOptions, compiler);

    await server.start();

    // Start a separate server for serving the HTML file
    const htmlServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <html>
          <head>
            <script src="http://localhost:${devServerPort}/main.js"></script>
          </head>
          <body></body>
        </html>
      `);
    });
    htmlServer.listen(htmlServerPort, htmlServerHost);

    const { page, browser } = await runBrowser();

    try {
      const pageErrors = [];

      page.on("pageerror", (error) => {
        pageErrors.push(error);
      });

      const scriptTagRequest = page.waitForResponse(
        `http://localhost:${devServerPort}/main.js`
      );

      await page.goto(`http://${htmlServerHost}:${htmlServerPort}`);

      const response = await scriptTagRequest;

      expect(response.status()).toBe(200);
    } finally {
      await browser.close();
      await server.stop();
      htmlServer.close();
    }
  });
});

// @see https://github.com/webpack/webpack-dev-server/security/advisories/GHSA-79cf-xcqc-c78w
describe("cross-origin resource policy header", () => {
  const devServerPort = port1;

  let server;

  afterEach(async () => {
    if (server) {
      await server.stop();
      // Allow the port to be fully released before the next test
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
      server = null;
    }
  });

  function request(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.get(url, { headers }, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      });
      req.on("error", reject);
    });
  }

  it("should set Cross-Origin-Resource-Policy: same-origin by default", async () => {
    const compiler = webpack(config);
    server = new Server(
      { port: devServerPort, allowedHosts: "auto" },
      compiler
    );

    await server.start();

    const res = await request(`http://localhost:${devServerPort}/main.js`);

    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  it("should NOT set CORP header when allowedHosts is 'all'", async () => {
    const compiler = webpack(config);
    server = new Server({ port: devServerPort, allowedHosts: "all" }, compiler);

    await server.start();

    const res = await request(`http://localhost:${devServerPort}/main.js`);

    expect(res.headers["cross-origin-resource-policy"]).toBeUndefined();
  });

  it("should NOT set CORP header when user configures wildcard CORS", async () => {
    const compiler = webpack(config);
    server = new Server(
      {
        port: devServerPort,
        allowedHosts: "auto",
        headers: { "Access-Control-Allow-Origin": "*" },
      },
      compiler
    );

    await server.start();

    const res = await request(`http://localhost:${devServerPort}/main.js`);

    expect(res.headers["cross-origin-resource-policy"]).toBeUndefined();
  });

  it("should set CORP header when user configures a specific-origin Access-Control-Allow-Origin (no-cors embedding is not governed by CORS)", async () => {
    const compiler = webpack(config);
    server = new Server(
      {
        port: devServerPort,
        allowedHosts: "auto",
        headers: {
          "Access-Control-Allow-Origin": "http://foo.example.com",
        },
      },
      compiler
    );

    await server.start();

    const res = await request(`http://localhost:${devServerPort}/main.js`);

    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  it("should set CORP header when user configures Access-Control-Allow-Origin via headers array with a specific origin", async () => {
    const compiler = webpack(config);
    server = new Server(
      {
        port: devServerPort,
        allowedHosts: "auto",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "http://foo.example.com",
          },
        ],
      },
      compiler
    );

    await server.start();

    const res = await request(`http://localhost:${devServerPort}/main.js`);

    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  it("should NOT set CORP header when user configures wildcard Access-Control-Allow-Origin via headers array", async () => {
    const compiler = webpack(config);
    server = new Server(
      {
        port: devServerPort,
        allowedHosts: "auto",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
      compiler
    );

    await server.start();

    const res = await request(`http://localhost:${devServerPort}/main.js`);

    expect(res.headers["cross-origin-resource-policy"]).toBeUndefined();
  });

  it("should NOT set CORP header when host is in allowedHosts", async () => {
    const compiler = webpack(config);
    server = new Server(
      { port: devServerPort, allowedHosts: ["localhost"] },
      compiler
    );

    await server.start();

    const res = await request(`http://localhost:${devServerPort}/main.js`);

    expect(res.status).toBe(200);
    expect(res.headers["cross-origin-resource-policy"]).toBeUndefined();
  });
});

// @see https://github.com/webpack/webpack-dev-server/security/advisories/GHSA-f5vj-f2hx-8m93
describe("cross-site request forgery on state-changing endpoints", () => {
  const devServerPort = port1;

  let server;

  beforeEach(async () => {
    const compiler = webpack(config);
    server = new Server(
      { port: devServerPort, allowedHosts: "auto" },
      compiler
    );

    await server.start();
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
      // Allow the port to be fully released before the next test
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
      server = null;
    }
  });

  function request(path, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://localhost:${devServerPort}${path}`,
        { headers },
        (res) => {
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            resolve({ status: res.statusCode, body });
          });
        }
      );
      req.on("error", reject);
    });
  }

  const endpoint = "/webpack-dev-server/invalidate";

  it(`should block cross-site requests to ${endpoint}`, async () => {
    const res = await request(endpoint, {
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site",
    });

    expect(res.status).toBe(403);
  });

  it(`should block same-site requests from another port to ${endpoint}`, async () => {
    const res = await request(endpoint, {
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
    });

    expect(res.status).toBe(403);
  });

  it(`should allow same-origin requests to ${endpoint}`, async () => {
    const res = await request(endpoint, {
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
    });

    expect(res.status).toBe(200);
  });

  it(`should allow user-initiated navigations to ${endpoint}`, async () => {
    const res = await request(endpoint, { "sec-fetch-site": "none" });

    expect(res.status).toBe(200);
  });

  it("should block requests with a cross-origin Origin and no Sec-Fetch metadata", async () => {
    const res = await request(endpoint, {
      origin: "http://evil.example",
    });

    expect(res.status).toBe(403);
  });

  it("should allow requests without Sec-Fetch metadata or Origin (e.g. curl)", async () => {
    const res = await request(endpoint);

    expect(res.status).toBe(200);
  });
});

describe("malformed Host/Origin headers", () => {
  const devServerPort = port1;

  // `[::1` is an invalid IPv6 literal; a soft hyphen (U+00AD) is removed by
  // IDNA mapping, leaving an empty hostname that newer Node.js versions reject
  // with `ERR_INVALID_URL`
  const malformedValues = [
    ["an invalid IPv6 literal", "[::1"],
    ["a soft hyphen", "­"],
  ];

  function isMalformed(value) {
    return (
      typeof value === "string" &&
      (value.includes("­") || /\[::1(?!\])/.test(value))
    );
  }

  function getMainStatus() {
    return new Promise((resolve, reject) => {
      http
        .get(`http://localhost:${devServerPort}/main.js`, (res) => {
          res.resume();
          resolve(res.statusCode);
        })
        .on("error", reject);
    });
  }

  describe.each([
    ["as parsed by the running Node.js version", false],
    ["when 'url.parse()' throws on them (as newer Node.js versions do)", true],
  ])("%s", (_title, simulateParseError) => {
    let server;
    let parseSpy;

    beforeEach(async () => {
      if (simulateParseError) {
        const originalParse = url.parse;

        parseSpy = jest.spyOn(url, "parse").mockImplementation((...args) => {
          if (isMalformed(args[0])) {
            throw new TypeError(`Invalid URL: ${args[0]}`);
          }

          return originalParse(...args);
        });
      }

      const compiler = webpack(config);
      server = new Server(
        { port: devServerPort, allowedHosts: "auto" },
        compiler
      );

      await server.start();
    });

    afterEach(async () => {
      if (parseSpy) {
        parseSpy.mockRestore();
        parseSpy = null;
      }

      if (server) {
        await server.stop();
        // Allow the port to be fully released before the next test
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });
        server = null;
      }
    });

    it.each(malformedValues)(
      "should reject a WebSocket upgrade with a malformed Origin header (%s) without crashing",
      async (_name, value) => {
        // A malformed `Origin` used to throw while being parsed and take down
        // the whole dev-server process.
        const messages = await new Promise((resolve) => {
          const received = [];
          const ws = new WebSocket(`ws://localhost:${devServerPort}/ws`, {
            headers: {
              host: `localhost:${devServerPort}`,
              origin: `http://${value}/`,
            },
          });
          // Never wait forever for the server to close the connection
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

        // The server must still be alive: a normal request still succeeds.
        expect(await getMainStatus()).toBe(200);
      }
    );

    it.each(malformedValues)(
      "should reject a request with a malformed Host header (%s) without crashing",
      async (_name, value) => {
        // Sent over a raw socket (as latin-1, byte for byte) so the malformed
        // value reaches the server as-is.
        const response = await new Promise((resolve) => {
          let data = "";
          const socket = net.connect(devServerPort, "127.0.0.1", () => {
            socket.write(
              [
                "GET /main.js HTTP/1.1",
                `Host: ${value}`,
                "Connection: close",
                "",
                "",
              ].join("\r\n"),
              "latin1"
            );
          });

          socket.on("data", (chunk) => {
            data += chunk;
          });
          socket.on("close", () => {
            resolve(data);
          });
          socket.on("error", () => {
            resolve(data);
          });
        });

        expect(response).toContain("Invalid Host header");

        // The server must still be alive: a normal request still succeeds.
        expect(await getMainStatus()).toBe(200);
      }
    );
  });
});
