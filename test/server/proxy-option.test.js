"use strict";

const http = require("http");
const path = require("path");
const request = require("supertest");
const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const webpack = require("webpack");
const Server = require("../../lib/Server");
const config = require("../fixtures/proxy-config/webpack.config");
const [port1, port2, port3, port4] = require("../ports-map")["proxy-option"];
const [hmrDevServerPort, hmrBackendPort] =
  require("../ports-map")["proxy-option-hmr"];

const WebSocketServer = WebSocket.Server;
const staticDirectory = path.resolve(__dirname, "../fixtures/proxy-config");

const proxyOptionPathsAsProperties = {
  "/proxy1": {
    target: `http://localhost:${port1}`,
  },
  "/api/proxy2": {
    target: `http://localhost:${port2}`,
    pathRewrite: { "^/api": "" },
  },
  "/foo": {
    bypass(req) {
      if (/\.html$/.test(req.path)) {
        return "/index.html";
      }

      return null;
    },
  },
  "/proxyfalse": {
    bypass(req) {
      if (/\/proxyfalse$/.test(req.path)) {
        return false;
      }
    },
  },
  "/proxy/async": {
    bypass(req, res) {
      if (/\/proxy\/async$/.test(req.path)) {
        return new Promise((resolve) => {
          setTimeout(() => {
            res.end("proxy async response");
            resolve(true);
          }, 10);
        });
      }
    },
  },
  "/bypass-with-target": {
    target: `http://localhost:${port1}`,
    changeOrigin: true,
    secure: false,
    bypass(req) {
      if (/\.(html)$/i.test(req.url)) {
        return req.url;
      }
    },
  },
};

const proxyOption = {
  context: () => true,
  target: `http://localhost:${port1}`,
};

const proxyOptionOfArray = [
  { context: "/proxy1", target: proxyOption.target },
  function proxy(req, res, next) {
    return {
      context: "/api/proxy2",
      target: `http://localhost:${port2}`,
      pathRewrite: { "^/api": "" },
      bypass: () => {
        if (req && req.query.foo) {
          res.end(`foo+${next.name}+${typeof next}`);

          return false;
        }
      },
    };
  },
];

const proxyOptionOfArrayWithoutTarget = [
  {
    router: () => `http://localhost:${port1}`,
  },
];

const proxyWithPath = {
  "/proxy1": {
    path: `http://localhost:${port1}`,
    target: `http://localhost:${port1}`,
  },
};

const proxyWithString = {
  "/proxy1": `http://localhost:${port1}`,
};

const proxyWithRouterAsObject = {
  router: () => `http://localhost:${port1}`,
};

describe("proxy option", () => {
  let proxyServer1;
  let proxyServer2;

  async function listenProxyServers() {
    const proxyApp1 = express();
    const proxyApp2 = express();

    proxyApp1.get("/proxy1", (req, res) => {
      res.send("from proxy1");
    });
    proxyApp1.get("/api", (req, res) => {
      res.send("api response from proxy1");
    });
    proxyApp2.get("/proxy2", (req, res) => {
      res.send("from proxy2");
    });

    await new Promise((resolve) => {
      proxyServer1 = proxyApp1.listen(port1, () => {
        resolve();
      });
    });

    await new Promise((resolve) => {
      proxyServer2 = proxyApp2.listen(port2, () => {
        resolve();
      });
    });
  }

  async function closeProxyServers() {
    await new Promise((resolve) => {
      proxyServer1.close(() => {
        resolve();
      });
    });

    await new Promise((resolve) => {
      proxyServer2.close(() => {
        resolve();
      });
    });
  }

  describe("as an object of paths with properties", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          static: {
            directory: staticDirectory,
            watch: false,
          },
          proxy: proxyOptionPathsAsProperties,
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    describe("target", () => {
      it("respects a proxy option when a request path is matched", async () => {
        const response = await req.get("/proxy1");

        expect(response.status).toEqual(200);
        expect(response.text).toContain("from proxy1");
      });
    });

    describe("pathRewrite", () => {
      it("respects a pathRewrite option", async () => {
        const response = await req.get("/api/proxy2");

        expect(response.status).toEqual(200);
        expect(response.text).toContain("from proxy2");
      });
    });

    describe("bypass", () => {
      it("can rewrite a request path", async () => {
        const response = await req.get("/foo/bar.html");

        expect(response.status).toEqual(200);
        expect(response.text).toContain("Hello");
      });

      it("can rewrite a request path regardless of the target defined a bypass option", async () => {
        const response = await req.get("/baz/hoge.html");

        expect(response.status).toEqual(200);
        expect(response.text).toContain("Hello");
      });

      it("should pass through a proxy when a bypass function returns null", async () => {
        const response = await req.get("/foo.js");

        expect(response.status).toEqual(200);
        expect(response.text).toContain("Hey");
      });

      it("should not pass through a proxy when a bypass function returns false", async () => {
        const response = await req.get("/proxyfalse");

        expect(response.status).toEqual(404);
      });

      it("should wait if bypass returns promise", async () => {
        const response = await req.get("/proxy/async");

        expect(response.status).toEqual(200);
        expect(response.text).toContain("proxy async response");
      });

      it("should work with the 'target' option", async () => {
        const response = await req.get("/bypass-with-target/foo.js");

        expect(response.status).toEqual(404);
      });

      it("should work with the 'target' option #2", async () => {
        const response = await req.get("/bypass-with-target/index.html");

        expect(response.status).toEqual(200);
        expect(response.text).toContain("Hello");
      });
    });
  });

  describe("as an option is an object with the `context` option", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: proxyOption,
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    it("respects a proxy option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy1");
    });
  });

  describe("as an option is an object with `context` and `target` as string", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: proxyWithString,
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    it("respects a proxy option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy1");
    });
  });

  describe("as an option is an object with the `path` option (`context` alias)", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: proxyWithPath,
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    it("respects a proxy option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy1");
    });
  });

  describe("as an option is an object with the `router` option", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: proxyWithRouterAsObject,
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    it("respects a proxy option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy1");
    });
  });

  describe("as an array", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: proxyOptionOfArray,
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    it("respects a proxy option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy1");
    });

    it("respects a proxy option of function", async () => {
      const response = await req.get("/api/proxy2");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy2");
    });

    it("should allow req, res, and next", async () => {
      const response = await req.get("/api/proxy2?foo=true");

      expect(response.statusCode).toEqual(200);
      expect(response.text).toEqual("foo+next+function");
    });
  });

  describe("as an array without the `route` option", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: proxyOptionOfArrayWithoutTarget,
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    it("respects a proxy option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy1");
    });
  });

  describe("should sharing a proxy option", () => {
    let server;
    let req;
    let listener;

    const proxyTarget = {
      target: `http://localhost:${port1}`,
    };

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: {
            "/proxy1": proxyTarget,
            "/proxy2": proxyTarget,
          },
          port: port3,
        },
        compiler
      );

      await server.start();

      const proxy = express();

      proxy.get("*", (proxyReq, res) => {
        res.send("from proxy");
      });

      listener = proxy.listen(port1);

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await new Promise((resolve) => {
        listener.close(() => {
          resolve();
        });
      });
    });

    it("respects proxy1 option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy");
    });

    it("respects proxy2 option", async () => {
      const response = await req.get("/proxy2");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy");
    });
  });

  describe("should handles external websocket upgrade", () => {
    let ws;
    let server;
    let webSocketServer;
    let responseMessage;

    const webSocketServerTypes = ["sockjs", "ws"];

    webSocketServerTypes.forEach((webSocketServerType) => {
      describe(`with webSocketServerType: ${webSocketServerType}`, () => {
        beforeAll(async () => {
          const compiler = webpack(config);

          server = new Server(
            {
              webSocketServer: webSocketServerType,
              proxy: [
                {
                  context: "/",
                  target: `http://localhost:${port4}`,
                  ws: true,
                },
              ],
              port: port3,
            },
            compiler
          );

          await server.start();

          webSocketServer = new WebSocketServer({ port: port4 });
          webSocketServer.on("connection", (connection) => {
            connection.on("message", (message) => {
              connection.send(message);
            });
          });
        });

        beforeEach((done) => {
          ws = new WebSocket(`ws://localhost:${port3}/proxy3/socket`, {
            origin: `http://localhost:${port3}`,
          });

          ws.on("message", (message) => {
            responseMessage = message.toString();
            done();
          });

          ws.on("open", () => {
            ws.send("foo");
          });
        });

        it("Should receive response", () => {
          expect(responseMessage).toEqual("foo");
        });

        afterAll(async () => {
          webSocketServer.close();

          for (const client of webSocketServer.clients) {
            client.terminate();
          }

          await server.stop();
        });
      });
    });
  });

  describe("HMR upgrade dispatching to user proxies", () => {
    let server;
    let backend;
    let backendWss;
    let backendSockets;
    let backendUpgradeCount;
    let proxyLogProvider;

    // Start a backend (the user proxy target) answering both HTTP requests and
    // WebSocket upgrades, and a dev server proxying everything to it with
    // `ws: true`, with the given dev server options merged in.
    const setup = async (devServerOptions) => {
      backendUpgradeCount = 0;
      backendSockets = [];
      proxyLogProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      backend = http.createServer((req, res) => {
        res.end("from backend");
      });
      backend.on("connection", (socket) => {
        backendSockets.push(socket);
      });
      backend.on("upgrade", () => {
        backendUpgradeCount += 1;
      });
      backendWss = new WebSocketServer({ server: backend });

      await new Promise((resolve) => {
        backend.listen(hmrBackendPort, resolve);
      });

      server = new Server(
        {
          hot: true,
          allowedHosts: "all",
          proxy: [
            {
              context: "/",
              target: `http://localhost:${hmrBackendPort}`,
              ws: true,
              logLevel: "debug",
              logProvider: () => proxyLogProvider,
            },
          ],
          port: hmrDevServerPort,
          ...devServerOptions,
        },
        webpack(config)
      );

      await server.start();
    };

    const teardown = async () => {
      await server.stop();

      backendWss.clients.forEach((client) => {
        client.terminate();
      });
      backendWss.close();
      // Drop any lingering proxy-opened sockets so `backend.close()` does not
      // hang (`server.closeAllConnections()` does not exist on older Node.js)
      backendSockets.forEach((socket) => {
        socket.destroy();
      });

      await new Promise((resolve) => {
        backend.close(resolve);
      });
    };

    // Everything `http-proxy-middleware` logged about forwarding an upgrade
    const getProxyUpgradeLogs = () =>
      Object.keys(proxyLogProvider)
        .reduce(
          (messages, level) =>
            messages.concat(
              proxyLogProvider[level].mock.calls.map((call) => String(call[0]))
            ),
          []
        )
        .filter((message) =>
          /\[HPM\] (Upgrading to WebSocket|Error occurred)/.test(message)
        );

    // Send a plain HTTP request through the dev server, which reaches the user
    // proxy middleware (and the backend)
    const httpGet = (requestPath) =>
      new Promise((resolve, reject) => {
        http
          .get(`http://localhost:${hmrDevServerPort}${requestPath}`, (res) => {
            let body = "";

            res.setEncoding("utf8");
            res.on("data", (chunk) => {
              body += chunk;
            });
            res.on("end", () => {
              resolve({ statusCode: res.statusCode, body });
            });
          })
          .on("error", reject);
      });

    // Open a WebSocket to `requestPath` and report whether the handshake
    // completed (`opened`) and whether the upgrade was forwarded to the backend
    // proxy target (`forwarded`).
    const probe = async (requestPath) => {
      const upgradesBefore = backendUpgradeCount;
      const logsBefore = getProxyUpgradeLogs().length;

      const ws = new WebSocket(
        `ws://localhost:${hmrDevServerPort}${requestPath}`
      );

      const opened = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 2000);

        ws.on("open", () => {
          clearTimeout(timer);
          resolve(true);
        });
        // Keep listening, a forwarded upgrade can corrupt an opened connection
        ws.on("error", () => {
          clearTimeout(timer);
          resolve(false);
        });
      });

      // Give an upgrade forwarded in parallel time to reach the backend
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      ws.terminate();

      return {
        opened,
        forwarded: backendUpgradeCount > upgradesBefore,
        proxyLogs: getProxyUpgradeLogs().slice(logsBefore),
      };
    };

    // The HMR socket is served locally and never forwarded, while any path the
    // HMR server does not own falls through to the user proxy. SockJS serves its
    // transport under `/<prefix>/<server>/<session>/websocket`.
    const serverTypes = [
      { type: "ws", hmrPath: "/ws", nonHmrPath: "/not-hmr" },
      {
        type: "sockjs",
        hmrPath: "/ws/000/abcd1234/websocket",
        nonHmrPath: "/not-hmr",
      },
    ];

    serverTypes.forEach(({ type, hmrPath, nonHmrPath }) => {
      describe(`with webSocketServerType: ${type}`, () => {
        beforeAll(() => setup({ webSocketServer: type }));

        afterAll(teardown);

        it("serves the HMR upgrade locally and does not forward it to the proxy", async () => {
          const { opened, forwarded, proxyLogs } = await probe(hmrPath);

          expect(opened).toBe(true);
          expect(forwarded).toBe(false);
          expect(proxyLogs).toEqual([]);
        });

        it("does not forward the HMR upgrade after an HTTP proxy request", async () => {
          await request(server.server).get("/api/hello").expect(200);

          const { opened } = await probe(hmrPath);

          await new Promise((resolve) => {
            setTimeout(resolve, 100);
          });

          expect(opened).toBe(true);
          expect(backendUpgradeCount).toBe(0);
        });

        it("forwards a non-HMR upgrade to the user proxy", async () => {
          const { opened, forwarded } = await probe(nonHmrPath);

          expect(opened).toBe(true);
          expect(forwarded).toBe(true);
        });
      });

      // `http-proxy-middleware` with `ws: true` subscribes itself to the server
      // "upgrade" event on the first proxied HTTP request; that subscription
      // must not become a way around the HMR upgrade dispatcher.
      describe(`with webSocketServerType: ${type} after a proxied HTTP request`, () => {
        beforeAll(async () => {
          await setup({ webSocketServer: type });

          const response = await httpGet("/from-backend");

          expect(response.statusCode).toBe(200);
          expect(response.body).toBe("from backend");
        });

        afterAll(teardown);

        it("serves the HMR upgrade locally and does not forward it to the proxy", async () => {
          const { opened, forwarded, proxyLogs } = await probe(hmrPath);

          expect(opened).toBe(true);
          expect(forwarded).toBe(false);
          expect(proxyLogs).toEqual([]);
        });

        it("forwards a non-HMR upgrade to the user proxy", async () => {
          const { opened, forwarded } = await probe(nonHmrPath);

          expect(opened).toBe(true);
          expect(forwarded).toBe(true);
        });
      });
    });

    // `ws`-specific: the dispatch compares the path exactly the same way
    // `WebSocketServer#shouldHandle` does, so only the configured path (query
    // stripped) is the HMR socket; every other variant is forwarded.
    describe("with the `ws` server, path matching is exact", () => {
      beforeAll(() => setup({ webSocketServer: "ws" }));

      afterAll(teardown);

      it.each([
        ["exact path", "/ws"],
        ["path with query string", "/ws?token=1"],
      ])("treats %s (%s) as the HMR upgrade path", async (_label, wsPath) => {
        const { opened, forwarded } = await probe(wsPath);

        expect(opened).toBe(true);
        expect(forwarded).toBe(false);
      });

      it.each([
        ["leading double slash", "//ws"],
        ["trailing slash", "/ws/"],
        ["uppercase", "/WS"],
        ["mixed case", "/wS"],
        ["percent-encoded path", "/%77%73"],
      ])("forwards %s (%s) to the user proxy", async (_label, wsPath) => {
        const { forwarded } = await probe(wsPath);

        expect(forwarded).toBe(true);
      });
    });

    // The HMR path is read from the configured `webSocketServer` options, not a
    // hardcoded `/ws`.
    describe("with a custom `ws` path", () => {
      beforeAll(() =>
        setup({
          webSocketServer: { type: "ws", options: { path: "/custom-hmr" } },
        })
      );

      afterAll(teardown);

      it("treats the configured path (/custom-hmr) as the HMR upgrade path", async () => {
        const { opened, forwarded } = await probe("/custom-hmr");

        expect(opened).toBe(true);
        expect(forwarded).toBe(false);
      });

      it("forwards the default path (/ws) once it is no longer the HMR path", async () => {
        const { forwarded } = await probe("/ws");

        expect(forwarded).toBe(true);
      });
    });

    // With no HMR server there is no socket to protect, so the filter never
    // engages and even `/ws` is forwarded to the user proxy.
    describe("without a webSocketServer", () => {
      beforeAll(() =>
        setup({ hot: false, liveReload: false, webSocketServer: false })
      );

      afterAll(teardown);

      it("forwards /ws to the user proxy because there is no HMR socket to protect", async () => {
        const { opened, forwarded } = await probe("/ws");

        expect(opened).toBe(true);
        expect(forwarded).toBe(true);
      });
    });
  });

  describe("should supports http methods", () => {
    let server;
    let req;
    let listener;
    const proxyTarget = {
      target: `http://localhost:${port1}`,
    };

    beforeAll(async () => {
      const compiler = webpack(config);

      server = new Server(
        {
          proxy: {
            "**": proxyTarget,
          },
          port: port3,
        },
        compiler
      );

      await server.start();

      const proxy = express();

      // Parse application/x-www-form-urlencoded
      proxy.use(bodyParser.urlencoded({ extended: false }));

      // Parse application/json
      proxy.use(bodyParser.json());

      // This forces Express to try to decode URLs, which is needed for the test
      // associated with the middleware below.
      proxy.all("*", (_req, res, next) => {
        next();
      });
      // We must define all 4 params in order for this to be detected as an
      // error handling middleware.
      // eslint-disable-next-line no-unused-vars
      proxy.use((error, proxyReq, res, next) => {
        res.status(500);
        res.send("error from proxy");
      });

      proxy.get("/get", (proxyReq, res) => {
        res.send("GET method from proxy");
      });

      proxy.head("/head", (proxyReq, res) => {
        res.send("HEAD method from proxy");
      });

      proxy.post("/post-x-www-form-urlencoded", (proxyReq, res) => {
        const id = proxyReq.body.id;

        res.status(200).send(`POST method from proxy (id: ${id})`);
      });

      proxy.post("/post-application-json", (proxyReq, res) => {
        const id = proxyReq.body.id;

        res.status(200).send({ answer: `POST method from proxy (id: ${id})` });
      });

      proxy.delete("/delete", (proxyReq, res) => {
        res.send("DELETE method from proxy");
      });

      listener = proxy.listen(port1);
      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();

      await new Promise((resolve) => {
        listener.close(() => {
          resolve();
        });
      });
    });

    it("errors", async () => {
      const response = await req.get("/%");

      expect(response.status).toEqual(500);
      expect(response.text).toContain("error from proxy");
    });

    it("GET method", async () => {
      const response = await req.get("/get");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("GET method from proxy");
    });

    it("HEAD method", async () => {
      const response = await req.head("/head");

      expect(response.status).toEqual(200);
    });

    it("POST method (application/x-www-form-urlencoded)", async () => {
      const response = await req
        .post("/post-x-www-form-urlencoded")
        .send("id=1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("POST method from proxy (id: 1)");
    });

    it("POST method (application/json)", async () => {
      const response = await req
        .post("/post-application-json")
        .send({ id: "1" })
        .set("Accept", "application/json");

      expect(response.status).toEqual(200);
      expect(response.headers["content-type"]).toEqual(
        "application/json; charset=utf-8"
      );
      expect(response.text).toContain("POST method from proxy (id: 1)");
    });

    it("DELETE method", async () => {
      const response = await req.delete("/delete");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("DELETE method from proxy");
    });
  });

  describe("should work in multi compiler mode", () => {
    let server;
    let req;

    beforeAll(async () => {
      const compiler = webpack([config, config]);

      server = new Server(
        {
          proxy: {
            "*": {
              context: () => true,
              target: `http://localhost:${port1}`,
            },
          },
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    it("respects a proxy option", async () => {
      const response = await req.get("/proxy1");

      expect(response.status).toEqual(200);
      expect(response.text).toContain("from proxy1");
    });
  });

  describe("should work and respect `logProvider` and `logLevel` options", () => {
    let server;
    let req;
    let customLogProvider;

    beforeAll(async () => {
      customLogProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const compiler = webpack([config, config]);

      server = new Server(
        {
          proxy: {
            "/my-path": {
              target: "http://unknown:1234",
              logProvider: () => customLogProvider,
              logLevel: "error",
            },
          },
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    describe("target", () => {
      it("respects a proxy option when a request path is matched", async () => {
        await req.get("/my-path");

        expect(customLogProvider.error).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("should work and respect the `logLevel` option with `silent` value", () => {
    let server;
    let req;
    let customLogProvider;

    beforeAll(async () => {
      customLogProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const compiler = webpack([config, config]);

      server = new Server(
        {
          proxy: {
            "/my-path": {
              target: "http://unknown:1234",
              logProvider: () => customLogProvider,
              logLevel: "silent",
            },
          },
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    describe("target", () => {
      it("respects a proxy option when a request path is matched", async () => {
        await req.get("/my-path");

        expect(customLogProvider.error).toHaveBeenCalledTimes(0);
      });
    });
  });

  describe("should work and respect the `infrastructureLogging.level` option", () => {
    let server;
    let req;
    let customLogProvider;

    beforeAll(async () => {
      customLogProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const compiler = webpack({
        ...config,
        infrastructureLogging: { level: "error" },
      });

      server = new Server(
        {
          proxy: {
            "/my-path": {
              target: "http://unknown:1234",
              logProvider: () => customLogProvider,
            },
          },
          port: port3,
        },
        compiler
      );

      await server.start();

      await listenProxyServers();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
      await closeProxyServers();
    });

    describe("target", () => {
      it("respects a proxy option when a request path is matched", async () => {
        await req.get("/my-path");

        expect(customLogProvider.error).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("should work and respect the `infrastructureLogging.level` option with `none` value", () => {
    let server;
    let req;
    let customLogProvider;

    beforeAll(async () => {
      customLogProvider = {
        log: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const compiler = webpack({
        ...config,
        infrastructureLogging: { level: "none" },
      });

      server = new Server(
        {
          proxy: {
            "/my-path": {
              target: "http://unknown:1234",
              logProvider: () => customLogProvider,
            },
          },
          port: port3,
        },
        compiler
      );

      await server.start();

      req = request(server.app);
    });

    afterAll(async () => {
      await server.stop();
    });

    describe("target", () => {
      it("respects a proxy option when a request path is matched", async () => {
        await req.get("/my-path");

        expect(customLogProvider.error).toHaveBeenCalledTimes(0);
      });
    });
  });
});
