import { Schema, type } from "@colyseus/schema";
import type { MatchState } from "./constants.js";

export class Alpha7StateSchema extends Schema {
  @type("string") matchState: MatchState = "waiting";
  @type("string") roomCode = "";
  @type("string") seed = "";
}

