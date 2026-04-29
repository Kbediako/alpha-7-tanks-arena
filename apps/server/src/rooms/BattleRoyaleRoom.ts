import { Room, type Client } from "colyseus";
import { BATTLE_ROYALE_ROOM } from "@alpha7/shared";
import { Alpha7StateSchema } from "@alpha7/shared/schema";
import type { ServerConfig } from "../config.js";

const makeRoomCode = (): string => Math.random().toString(36).slice(2, 8).toUpperCase();

export class BattleRoyaleRoom extends Room<Alpha7StateSchema> {
  async onCreate(options: { config: ServerConfig; privateRoom?: boolean; seed?: string }) {
    const { config } = options;
    const isPrivate = Boolean(options.privateRoom);
    this.maxClients = config.demoMaxPlayers;
    this.roomId = isPrivate ? makeRoomCode() : this.roomId;
    await this.setPrivate(isPrivate);
    const state = new Alpha7StateSchema();
    state.roomCode = this.roomId;
    state.seed = options.seed ?? `alpha7-${Date.now().toString(36)}`;
    this.setState(state);
    this.setMetadata({
      roomName: BATTLE_ROYALE_ROOM,
      roomCode: this.roomId,
      private: isPrivate,
      matchState: this.state.matchState
    });
  }

  onJoin(client: Client) {
    client.send("system", {
      message: "joined",
      roomCode: this.state.roomCode,
      matchState: this.state.matchState,
      seed: this.state.seed
    });
  }

  onLeave(_client: Client) {
    // Full player state cleanup lands with the authoritative room lifecycle.
  }
}
