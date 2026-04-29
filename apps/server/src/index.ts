import { createServer } from "node:http";
import { Encoder } from "@colyseus/schema";
import cors from "cors";
import express from "express";
import { matchMaker, Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { BATTLE_ROYALE_ROOM, type HealthResponse } from "@alpha7/shared";
import { serverConfig } from "./config.js";
import { BattleRoyaleRoom } from "./rooms/BattleRoyaleRoom.js";

Encoder.BUFFER_SIZE = 96 * 1024;

const app = express();

const isAllowedOrigin = (origin: string | undefined): boolean =>
  !origin || serverConfig.allowedOrigins.includes(origin);

matchMaker.controller.DEFAULT_CORS_HEADERS["Access-Control-Allow-Origin"] = serverConfig.publicClientUrl;
matchMaker.controller.getCorsHeaders = (req) => {
  const origin = req.headers.origin;
  const requestOrigin = Array.isArray(origin) ? origin[0] : origin;

  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(requestOrigin)
      ? requestOrigin ?? serverConfig.publicClientUrl
      : serverConfig.publicClientUrl,
    Vary: "Origin"
  };
};

app.disable("x-powered-by");
app.use(express.json());
app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    }
  })
);

app.get("/healthz", (_req, res) => {
  const payload: HealthResponse = {
    ok: true,
    service: "alpha7-server",
    room: BATTLE_ROYALE_ROOM,
    version: serverConfig.buildVersion
  };
  res.json(payload);
});

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    verifyClient(info, done) {
      if (isAllowedOrigin(info.origin)) {
        done(true);
        return;
      }
      done(false, 403, "Origin not allowed");
    }
  })
});

gameServer.define(BATTLE_ROYALE_ROOM, BattleRoyaleRoom, { config: serverConfig });

try {
  await gameServer.listen(serverConfig.port);
  console.log(
    `[alpha7] server listening on :${serverConfig.port} room=${BATTLE_ROYALE_ROOM} origins=${serverConfig.allowedOrigins.join(",")}`
  );
} catch (error) {
  console.error("[alpha7] failed to start server", error);
  process.exit(1);
}
