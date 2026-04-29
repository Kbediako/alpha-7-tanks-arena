import { BATTLE_ROYALE_ROOM, TANK_ARCHETYPE_CONFIG } from "@alpha7/shared";
import { Crosshair, Map, RadioTower, Shield, Wrench } from "lucide-react";

const archetypes = Object.values(TANK_ARCHETYPE_CONFIG);
const statLabels = ["firepower", "armor", "mobility", "support"] as const;

function Dots({ value }: { value: number }) {
  return (
    <span className="dots" aria-label={`${value} of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span className={index < value ? "dot is-filled" : "dot"} key={index} />
      ))}
    </span>
  );
}

export function App() {
  return (
    <main className="game-shell">
      <div className="arena-preview" aria-hidden="true">
        <div className="arena-grid" />
        {Array.from({ length: 8 }, (_, index) => (
          <span className={`wall wall-${index}`} key={index} />
        ))}
        <span className="preview-tank" />
      </div>

      <section className="landing-panel hud-panel" aria-label="Alpha-7 launch panel">
        <p className="eyebrow">Room Protocol / {BATTLE_ROYALE_ROOM}</p>
        <h1>Alpha-7 Tanks Arena</h1>
        <p className="summary">
          Mobile-first 3D battle royale tank combat in seeded concrete arenas. Pick a chassis, lock a
          room code, survive the danger zone.
        </p>
        <form className="join-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Callsign
            <input maxLength={18} name="playerName" placeholder="Operator" />
          </label>
          <div className="actions">
            <button type="button" className="primary-button">
              Quick Play
            </button>
            <button type="button" className="secondary-button">
              Create Lobby
            </button>
          </div>
        </form>
      </section>

      <section className="tank-select hud-panel" aria-label="Tank selection">
        <div className="panel-heading">
          <span>Tank Kit</span>
          <span>4 Chassis</span>
        </div>
        <div className="tank-grid">
          {archetypes.map((tank) => (
            <button type="button" className="tank-card" key={tank.id}>
              <span>
                <strong>{tank.name}</strong>
                <small>{tank.role}</small>
              </span>
              {statLabels.map((label) => (
                <span className="stat-row" key={label}>
                  <em>{label}</em>
                  <Dots value={tank.stats[label]} />
                </span>
              ))}
            </button>
          ))}
        </div>
      </section>

      <div className="hud-layer" aria-label="Game HUD preview">
        <section className="hud-panel minimap-panel">
          <header>
            <Map size={16} />
            <span>MAP</span>
            <b>1.2x</b>
          </header>
          <div className="minimap-grid">
            <span className="self-marker" />
            <span className="threat-marker" />
          </div>
        </section>
        <section className="hud-panel match-header">
          <span>ROOM A7</span>
          <strong>04:32</strong>
          <span>ALIVE 8/8</span>
        </section>
        <section className="hud-panel ability-dock">
          <button aria-label="Smoke">
            <RadioTower size={22} />
          </button>
          <button aria-label="Shield pulse">
            <Shield size={22} />
          </button>
          <button aria-label="Repair">
            <Wrench size={22} />
          </button>
          <button aria-label="Target">
            <Crosshair size={22} />
          </button>
        </section>
      </div>
    </main>
  );
}
