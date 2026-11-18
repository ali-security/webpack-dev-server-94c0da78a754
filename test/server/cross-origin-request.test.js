"use strict";

const request = require("supertest");
const webpack = require("webpack");
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
