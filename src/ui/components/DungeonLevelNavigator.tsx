import { useMemo, useState } from "react";
import type { UiDungeonStructureGenerationResult } from "../../generationWorkerProtocol";
import type { VerticalConnectionKind } from "../../dungeonStructure";

interface VerticalConnectionOption {
  id: VerticalConnectionKind;
  label: string;
}

interface DungeonLevelNavigatorProps {
  structureRun: UiDungeonStructureGenerationResult;
  selectedLevelId: string;
  connectionKindOptions: readonly VerticalConnectionOption[];
  onSelectLevel: (levelId: string) => void;
}

type LevelGroup = {
  id: "below" | "main" | "above";
  label: string;
  levels: UiDungeonStructureGenerationResult["structure"]["levels"][number][];
};

function getLevelDepthLabel(verticalIndex: number): string {
  if (verticalIndex < 0) return `Subsolo ${Math.abs(verticalIndex).toString().padStart(2, "0")}`;
  if (verticalIndex === 0) return "Nível principal";
  return `Andar superior +${verticalIndex}`;
}

function getLevelStatus(
  levelId: string,
  isolatedLevelIds: readonly string[],
  disconnectedLevelIds: readonly string[],
  entryLevelId?: string,
): { label: string; className: string } {
  if (isolatedLevelIds.includes(levelId)) return { label: "Isolado", className: "isolated" };
  if (entryLevelId && disconnectedLevelIds.includes(levelId)) {
    return { label: "Sem rota da entrada", className: "disconnected" };
  }
  if (!entryLevelId) return { label: "Entrada não definida", className: "unverified" };
  return { label: "Acessível", className: "connected" };
}

export function DungeonLevelNavigator({
  structureRun,
  selectedLevelId,
  connectionKindOptions,
  onSelectLevel,
}: DungeonLevelNavigatorProps) {
  const [overviewOpen, setOverviewOpen] = useState(false);
  const { structure, connectivity, levels: levelGenerations } = structureRun;
  const levels = structure.levels;
  const verticalConnectionCount = structure.verticalConnections.length;
  const verticalConnectionLabel = verticalConnectionCount === 1 ? "conexão" : "conexões";
  const cycleLabel = connectivity.cycleCount === 1 ? "ciclo" : "ciclos";
  const levelById = useMemo(() => new Map(levels.map((level) => [level.id, level])), [levels]);
  const roomCountByLevel = useMemo(
    () => new Map(levelGenerations.map(({ levelId, generation }) => [
      levelId,
      generation.dungeon.roomDetails.length,
    ])),
    [levelGenerations],
  );
  const connectionCountByLevel = useMemo(() => {
    const counts = new Map(levels.map((level) => [level.id, 0]));
    for (const connection of structure.verticalConnections) {
      counts.set(connection.sourceLevelId, (counts.get(connection.sourceLevelId) ?? 0) + 1);
      counts.set(connection.targetLevelId, (counts.get(connection.targetLevelId) ?? 0) + 1);
    }
    return counts;
  }, [levels, structure.verticalConnections]);
  const levelGroups = useMemo<LevelGroup[]>(() => {
    const orderedLevels = [...levels].sort((left, right) => left.verticalIndex - right.verticalIndex);
    const groups: LevelGroup[] = [
      {
        id: "below",
        label: "Subsolos",
        levels: orderedLevels.filter((level) => level.verticalIndex < 0),
      },
      {
        id: "main",
        label: "Nível principal",
        levels: orderedLevels.filter((level) => level.verticalIndex === 0),
      },
      {
        id: "above",
        label: "Andares superiores",
        levels: orderedLevels.filter((level) => level.verticalIndex > 0),
      },
    ];
    return groups.filter((group) => group.levels.length > 0);
  }, [levels]);

  const getConnectionKindLabel = (kind: VerticalConnectionKind) => (
    connectionKindOptions.find((option) => option.id === kind)?.label ?? kind
  );
  const getConnectionDirection = (direction: string) => {
    if (direction === "bidirectional") return { icon: "↔", label: "Acesso nos dois sentidos" };
    if (direction === "source-to-target") return { icon: "→", label: "Origem para destino" };
    return { icon: "←", label: "Destino para origem" };
  };

  const isolatedLevels = levels.filter((level) => (
    connectivity.isolatedLevelIds.includes(level.id)
  ));

  return (
    <section className="level-navigation" aria-label="Navegador de níveis">
      <header className="level-navigation-header">
        <div className="level-navigation-title">
          <span className="level-navigation-kicker">ESTRUTURA MULTINÍVEL</span>
          <strong>{levelById.get(selectedLevelId)?.name ?? "Nível selecionado"}</strong>
        </div>
        <div className="level-navigation-header-actions">
          <span className="level-navigation-summary">
            {levels.length} níveis · {verticalConnectionCount} {verticalConnectionLabel}
          </span>
          <button
            className="level-overview-toggle"
            type="button"
            aria-expanded={overviewOpen}
            aria-controls="level-structure-overview"
            onClick={() => setOverviewOpen((open) => !open)}
          >
            {overviewOpen ? "Ocultar visão global" : "Visão global"}
          </button>
        </div>
      </header>
      <div className="level-navigator-groups">
        {levelGroups.map((group) => (
          <section className="level-depth-group" key={group.id} aria-label={group.label}>
            <h3>{group.label}</h3>
            <div className="level-depth-cards">
              {group.levels.map((level) => {
                const status = getLevelStatus(
                  level.id,
                  connectivity.isolatedLevelIds,
                  connectivity.disconnectedLevelIds,
                  connectivity.entryLevelId,
                );
                const roomCount = roomCountByLevel.get(level.id) ?? 0;
                const connectionCount = connectionCountByLevel.get(level.id) ?? 0;
                const roomLabel = roomCount === 1 ? "sala" : "salas";
                const connectionLabel = connectionCount === 1 ? "conexão" : "conexões";
                const isSelected = selectedLevelId === level.id;
                return (
                  <button
                    className={`level-card${isSelected ? " selected" : ""}`}
                    type="button"
                    key={level.id}
                    aria-pressed={isSelected}
                    aria-label={`${level.name}, ${getLevelDepthLabel(level.verticalIndex)}, ${roomCount} ${roomLabel}, ${connectionCount} ${connectionCount === 1 ? "conexão vertical" : "conexões verticais"}, ${status.label}`}
                    onClick={() => onSelectLevel(level.id)}
                  >
                    <span className="level-card-depth">{getLevelDepthLabel(level.verticalIndex)}</span>
                    <strong>{level.name}</strong>
                    <small>{roomCount} {roomLabel} · {connectionCount} {connectionLabel}</small>
                    <span className={`level-card-status ${status.className}`}>{status.label}</span>
                    {(level.isSecret || level.isOptional) && (
                      <span className="level-card-tags">
                        {level.isSecret && <span>Secreto</span>}
                        {level.isOptional && <span>Opcional</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {overviewOpen && (
        <div
          className="level-structure-overview"
          id="level-structure-overview"
          aria-label="Visão global da estrutura vertical"
        >
          <div className="level-structure-summary">
            <strong>Visão estrutural</strong>
            <span>
              {verticalConnectionCount} {verticalConnectionLabel} · {connectivity.cycleCount} {cycleLabel}
              {isolatedLevels.length > 0
                ? ` · ${isolatedLevels.length} ${isolatedLevels.length === 1 ? "nível isolado" : "níveis isolados"}`
                : ""}
            </span>
          </div>
          {structure.verticalConnections.length > 0 ? (
            <ol className="level-structure-connections">
              {structure.verticalConnections.map((connection) => {
                const source = levelById.get(connection.sourceLevelId);
                const target = levelById.get(connection.targetLevelId);
                if (!source || !target) return null;
                const direction = getConnectionDirection(connection.direction);
                return (
                  <li className="level-structure-connection" key={connection.id}>
                    <button
                      className={`level-structure-endpoint${selectedLevelId === source.id ? " selected" : ""}`}
                      type="button"
                      aria-label={`Selecionar ${source.name}`}
                      onClick={() => onSelectLevel(source.id)}
                    >
                      <span>{getLevelDepthLabel(source.verticalIndex)}</span>
                      <strong>{source.name}</strong>
                      <small>Grade {connection.sourcePosition.x}, {connection.sourcePosition.y}</small>
                    </button>
                    <div className="level-structure-link">
                      <span aria-hidden="true">{direction.icon}</span>
                      <strong>{getConnectionKindLabel(connection.kind)}</strong>
                      <small>{direction.label}</small>
                      {connection.accessRequirements && connection.accessRequirements.length > 0 && (
                        <small>Requer: {connection.accessRequirements.join(", ")}</small>
                      )}
                    </div>
                    <button
                      className={`level-structure-endpoint${selectedLevelId === target.id ? " selected" : ""}`}
                      type="button"
                      aria-label={`Selecionar ${target.name}`}
                      onClick={() => onSelectLevel(target.id)}
                    >
                      <span>{getLevelDepthLabel(target.verticalIndex)}</span>
                      <strong>{target.name}</strong>
                      <small>Grade {connection.targetPosition.x}, {connection.targetPosition.y}</small>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="level-structure-empty">Não há conexões verticais registradas nesta estrutura.</p>
          )}
          {isolatedLevels.length > 0 && (
            <div className="level-structure-isolated" role="status">
              <strong>{isolatedLevels.length === 1 ? "Nível isolado" : "Níveis isolados"}</strong>
              <span>{isolatedLevels.map((level) => level.name).join(", ")}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
