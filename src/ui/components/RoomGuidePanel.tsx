import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  TRAP_DEFINITIONS,
  type Dungeon,
  type DungeonRoom,
} from "../../dungeon";
import {
  getTreasureDefinition,
  TREASURE_CATEGORY_LABELS,
  TREASURE_RARITY_LABELS,
} from "../../treasures";
import {
  ROOM_TYPE_CATEGORIES,
  ROOM_TYPE_CATEGORY_ORDER,
} from "../../roomTypes";
import type { RoomTypeCategory } from "../../roomTypes";
import type { RoomConnectionSummary } from "../../roomConnections";
import {
  getRoomFloorColor,
} from "../../rendering/dungeonTileSemantics";
import { liquidFeatureLabels, roomShapeLabels } from "./RoomMetadata";
import type { RoomMapElement, RoomMapSummary } from "./roomMapSummary";

type PanelView = "list" | "details";
type RoomSort = "number" | "category";

interface RoomGuidePanelProps {
  dungeon: Dungeon;
  hasGenerationResult: boolean;
  generationSummary: string;
  emptyTitle: string;
  emptyMessage: string;
  selectedRoomNumber?: number;
  selectionRequestId?: number;
  connectionsByRoom: ReadonlyMap<number, readonly RoomConnectionSummary[]>;
  roomMapSummary: RoomMapSummary;
  entryRoomNumber?: number;
  onSelectRoom: (roomNumber: number) => void;
  onHoverRoom: (roomNumber: number | undefined) => void;
  onLocateRoom: (roomNumber: number) => void;
  onOpenFullDetails: (roomNumber: number) => void;
  children?: ReactNode;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function getConnectionLabel(connection: RoomConnectionSummary): string {
  const typeLabels: Record<RoomConnectionSummary["connectionType"], string> = {
    corridor: "Corredor",
    "open-passage": "Passagem aberta",
    door: "Porta",
    "secret-door": "Porta secreta",
    "blocked-passage": "Passagem bloqueada",
    vertical: "Conexão vertical",
  };
  const label = typeLabels[connection.connectionType];
  const stateLabels = [
    connection.isLocked ? "trancada" : "",
    connection.isBlocked ? "bloqueada" : "",
    connection.isOptional ? "opcional" : "",
    connection.isSecret && connection.connectionType !== "secret-door" ? "secreta" : "",
  ].filter(Boolean);
  return stateLabels.length > 0 ? `${label} · ${stateLabels.join(" · ")}` : label;
}

function getRoomSearchText(
  room: DungeonRoom,
  connections: readonly RoomConnectionSummary[],
  mapElements: readonly RoomMapElement[],
): string {
  const category = ROOM_TYPE_CATEGORIES[room.roomType.category];
  const trapNames = room.traps.map((trap) => TRAP_DEFINITIONS[trap].label);
  const treasureNames = room.treasures.map((treasure) => (
    getTreasureDefinition(treasure.type)?.label ?? "Tesouro"
  ));
  const liquidName = room.liquidType && room.liquidFeature
    ? liquidFeatureLabels[room.liquidType][room.liquidFeature]
    : room.liquidType === "water"
      ? "água"
      : room.liquidType === "lava"
        ? "lava"
        : "";
  return normalizeSearchText([
    room.number,
    room.roomType.title,
    room.roomType.description,
    category.label,
    category.shortLabel,
    roomShapeLabels[room.shape],
    `${room.width} ${room.height}`,
    liquidName,
    ...trapNames,
    ...treasureNames,
    ...connections.map((connection) => getConnectionLabel(connection)),
    ...mapElements.flatMap((element) => [element.label, element.detail]),
  ].join(" "));
}

export function RoomGuidePanel({
  dungeon,
  hasGenerationResult,
  generationSummary,
  emptyTitle,
  emptyMessage,
  selectedRoomNumber,
  selectionRequestId,
  connectionsByRoom,
  roomMapSummary,
  entryRoomNumber,
  onSelectRoom,
  onHoverRoom,
  onLocateRoom,
  onOpenFullDetails,
  children,
}: RoomGuidePanelProps) {
  const [panelView, setPanelView] = useState<PanelView>("list");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<RoomTypeCategory | "all">("all");
  const [sortBy, setSortBy] = useState<RoomSort>("number");
  const [collapsedCategories, setCollapsedCategories] = useState<ReadonlySet<RoomTypeCategory>>(
    new Set(),
  );
  const listRef = useRef<HTMLDivElement | null>(null);
  const previousPanelViewRef = useRef<PanelView>("list");
  const rooms = dungeon.roomDetails;
  const selectedRoom = rooms.find((room) => room.number === selectedRoomNumber);
  const roomByNumber = useMemo(
    () => new Map(rooms.map((room) => [room.number, room])),
    [rooms],
  );
  const roomAreas = roomMapSummary.roomAreas;

  useEffect(() => {
    setPanelView(selectedRoom ? "details" : "list");
  }, [selectedRoom?.number, selectionRequestId]);

  useEffect(() => {
    const enteredList = panelView === "list" && previousPanelViewRef.current !== "list";
    previousPanelViewRef.current = panelView;
    if (!enteredList || selectedRoomNumber === undefined) return;
    const list = listRef.current;
    const selectedEntry = list?.querySelector<HTMLButtonElement>(
      `button[data-room-number="${selectedRoomNumber}"]`,
    );
    if (!list || !selectedEntry) return;
    const listBounds = list.getBoundingClientRect();
    const entryBounds = selectedEntry.getBoundingClientRect();
    if (entryBounds.top < listBounds.top) {
      list.scrollTo({
        top: list.scrollTop - (listBounds.top - entryBounds.top),
        behavior: "smooth",
      });
    } else if (entryBounds.bottom > listBounds.bottom) {
      list.scrollTo({
        top: list.scrollTop + (entryBounds.bottom - listBounds.bottom),
        behavior: "smooth",
      });
    }
  }, [panelView, selectedRoomNumber]);

  const filteredRooms = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query.trim());
    const result = rooms.filter((room) => {
      if (categoryFilter !== "all" && room.roomType.category !== categoryFilter) return false;
      if (!normalizedQuery) return true;
      return getRoomSearchText(
        room,
        connectionsByRoom.get(room.number) ?? [],
        roomMapSummary.elementsByRoom.get(room.number) ?? [],
      ).includes(normalizedQuery);
    });
    result.sort((left, right) => {
      if (sortBy === "category") {
        const categoryOrder = ROOM_TYPE_CATEGORIES[left.roomType.category].label.localeCompare(
          ROOM_TYPE_CATEGORIES[right.roomType.category].label,
          "pt-BR",
        );
        if (categoryOrder !== 0) return categoryOrder;
      }
      return left.number - right.number;
    });
    return result;
  }, [categoryFilter, connectionsByRoom, query, roomMapSummary, rooms, sortBy]);

  const roomGroups = useMemo(() => {
    if (sortBy !== "category") return [];
    const groups = new Map<RoomTypeCategory, DungeonRoom[]>();
    for (const room of filteredRooms) {
      const group = groups.get(room.roomType.category) ?? [];
      group.push(room);
      groups.set(room.roomType.category, group);
    }
    return [...groups.entries()];
  }, [filteredRooms, sortBy]);

  const toggleCategory = (category: RoomTypeCategory) => {
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const renderRoomEntry = (room: DungeonRoom) => {
    const category = ROOM_TYPE_CATEGORIES[room.roomType.category];
    const isSelected = selectedRoomNumber === room.number;
    const connectionCount = new Set(
      (connectionsByRoom.get(room.number) ?? []).map((connection) => connection.roomNumber),
    ).size;
    const liquidLabel = room.liquidType && room.liquidFeature
      ? liquidFeatureLabels[room.liquidType][room.liquidFeature]
      : room.liquidType === "water"
        ? "Água"
        : room.liquidType === "lava"
          ? "Lava"
          : null;

    return (
      <button
        className={`room-entry room-entry-button${isSelected ? " selected" : ""}`}
        type="button"
        key={room.number}
        data-room-number={room.number}
        aria-pressed={isSelected}
        aria-label={`Inspecionar sala ${room.number}: ${room.roomType.title}`}
        onPointerEnter={() => onHoverRoom(room.number)}
        onPointerLeave={() => onHoverRoom(undefined)}
        onFocus={() => onHoverRoom(room.number)}
        onBlur={() => onHoverRoom(undefined)}
        onClick={() => {
          onHoverRoom(undefined);
          onSelectRoom(room.number);
          setPanelView("details");
        }}
      >
        <span
          className="room-badge"
          style={{
            borderColor: category.color,
            backgroundColor: `${getRoomFloorColor(room.roomType.category)}44`,
            color: category.color,
          }}
        >
          {room.number.toString().padStart(2, "0")}
        </span>
        <span className="room-copy">
          <span className="room-copy-heading">
            <strong>{room.roomType.title}</strong>
          </span>
          {(liquidLabel || room.treasures.length > 0 || room.traps.length > 0) && (
            <span className="room-card-badges">
              {liquidLabel && (
                <span className={`room-guide-feature-badge ${room.liquidType === "lava" ? "lava-room-badge" : "water-room-badge"}`}>
                  {liquidLabel}
                </span>
              )}
              {room.treasures.length > 0 && (
                <span className="room-guide-feature-badge treasure-room-badge">
                  {room.treasures.length} {room.treasures.length === 1 ? "tesouro" : "tesouros"}
                </span>
              )}
              {room.traps.length > 0 && (
                <span className="room-guide-feature-badge trap-room-badge">
                  {room.traps.length} {room.traps.length === 1 ? "armadilha" : "armadilhas"}
                </span>
              )}
            </span>
          )}
          <small style={{ color: category.color }}>
            {category.shortLabel} · {room.width} × {room.height} tiles
          </small>
          <small className="room-entry-context">
            {roomShapeLabels[room.shape]} · {connectionCount} {connectionCount === 1 ? "conexão" : "conexões"}
          </small>
        </span>
      </button>
    );
  };

  const selectedConnections = selectedRoom
    ? [...(connectionsByRoom.get(selectedRoom.number) ?? [])]
      .sort((left, right) => left.roomNumber - right.roomNumber)
    : [];
  const selectedCategory = selectedRoom
    ? ROOM_TYPE_CATEGORIES[selectedRoom.roomType.category]
    : undefined;
  const selectedMapElements = selectedRoom
    ? roomMapSummary.elementsByRoom.get(selectedRoom.number) ?? []
    : [];

  return (
    <section className="room-index" aria-label="Guia e inspetor de salas">
      <header className="room-index-heading">
        <div>
          <span className="room-index-kicker">GUIA DE SALAS</span>
          <strong>Salas e armadilhas</strong>
          <span className="room-index-summary">{generationSummary}</span>
        </div>
        <span
          className="room-total"
          aria-label={hasGenerationResult ? `${rooms.length} salas` : "Salas aguardando geração"}
        >
          {hasGenerationResult ? rooms.length.toString().padStart(2, "0") : "..."}
        </span>
      </header>
      <div className="room-guide-tabs" role="tablist" aria-label="Conteúdo do guia de salas">
        <button
          id="room-guide-list-tab"
          className="room-guide-tab"
          type="button"
          role="tab"
          aria-selected={panelView === "list"}
          aria-controls="room-guide-content"
          onClick={() => setPanelView("list")}
        >
          Lista
        </button>
        <button
          id="room-guide-details-tab"
          className="room-guide-tab"
          type="button"
          role="tab"
          aria-selected={panelView === "details"}
          aria-controls="room-guide-content"
          disabled={!selectedRoom}
          onClick={() => setPanelView("details")}
        >
          Inspetor
        </button>
      </div>
      <div
        id="room-guide-content"
        className="room-guide-content"
        role="tabpanel"
        aria-labelledby={panelView === "list" ? "room-guide-list-tab" : "room-guide-details-tab"}
      >
        {panelView === "list" ? (
          <>
            {hasGenerationResult && rooms.length > 0 && (
              <div className="room-guide-controls">
                <label className="room-guide-search">
                  <span className="sr-only">Buscar salas</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar por nome ou característica"
                  />
                </label>
                <div className="room-guide-filter-row">
                  <label>
                    <span className="sr-only">Filtrar por categoria</span>
                    <select
                      value={categoryFilter}
                      onChange={(event) => setCategoryFilter(event.target.value as RoomTypeCategory | "all")}
                    >
                      <option value="all">Todas as categorias</option>
                      {ROOM_TYPE_CATEGORY_ORDER.map((category) => (
                        <option key={category} value={category}>
                          {ROOM_TYPE_CATEGORIES[category].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">Ordenar salas</span>
                    <select
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value as RoomSort)}
                    >
                      <option value="number">Por número</option>
                      <option value="category">Por categoria</option>
                    </select>
                  </label>
                </div>
              </div>
            )}
            <div className="room-list" ref={listRef}>
              {!hasGenerationResult && (
                <div className="room-empty">
                  <span className="empty-room-icon" aria-hidden="true">⌁</span>
                  <strong>{emptyTitle}</strong>
                  <p>{emptyMessage}</p>
                </div>
              )}
              {hasGenerationResult && rooms.length === 0 && (
                <div className="room-empty">
                  <span className="empty-room-icon" aria-hidden="true">⌁</span>
                  <strong>Sem salas individuais</strong>
                  <p>Este conceito não gera salas numeradas; armadilhas de cavernas e trilhas aparecem abaixo.</p>
                </div>
              )}
              {hasGenerationResult && rooms.length > 0 && filteredRooms.length === 0 && (
                <div className="room-empty room-empty-filtered">
                  <strong>Nenhuma sala encontrada</strong>
                  <p>Ajuste a busca ou a categoria para ver outros resultados.</p>
                </div>
              )}
              {sortBy === "category"
                ? roomGroups.map(([category, groupedRooms]) => {
                  const categoryInfo = ROOM_TYPE_CATEGORIES[category];
                  const isCollapsed = collapsedCategories.has(category);
                  return (
                    <section className="room-category-group" key={category}>
                      <button
                        className="room-category-group-toggle"
                        type="button"
                        aria-expanded={!isCollapsed}
                        onClick={() => toggleCategory(category)}
                      >
                        <span style={{ color: categoryInfo.color }}>{categoryInfo.label}</span>
                        <span>{groupedRooms.length.toString().padStart(2, "0")}</span>
                      </button>
                      {!isCollapsed && groupedRooms.map(renderRoomEntry)}
                    </section>
                  );
                })
                : filteredRooms.map(renderRoomEntry)}
              {panelView === "list" && children}
            </div>
          </>
        ) : selectedRoom && selectedCategory ? (
          <div className="room-inspector">
            <header className="room-inspector-heading">
              <span
                className="room-badge"
                style={{
                  borderColor: selectedCategory.color,
                  backgroundColor: `${getRoomFloorColor(selectedRoom.roomType.category)}44`,
                  color: selectedCategory.color,
                }}
              >
                {selectedRoom.number.toString().padStart(2, "0")}
              </span>
              <div>
                <span className="room-index-kicker">SALA {selectedRoom.number.toString().padStart(2, "0")}</span>
                <h3>{selectedRoom.roomType.title}</h3>
                <small style={{ color: selectedCategory.color }}>{selectedCategory.label}</small>
              </div>
            </header>
            <p className="room-inspector-description">{selectedRoom.roomType.description}</p>
            <dl className="room-inspector-facts">
              <div>
                <dt>Dimensões</dt>
                <dd>{selectedRoom.width} × {selectedRoom.height} tiles</dd>
              </div>
              <div>
                <dt>Área de piso</dt>
                <dd>{roomAreas.get(selectedRoom.number) ?? 0} tiles</dd>
              </div>
              <div>
                <dt>Formato</dt>
                <dd>{roomShapeLabels[selectedRoom.shape]}</dd>
              </div>
              <div>
                <dt>Posição (X, Y)</dt>
                <dd>{selectedRoom.x}, {selectedRoom.y}</dd>
              </div>
            </dl>
            <section className="room-inspector-section">
              <h4>Entrada e saída</h4>
              <div className="room-inspector-tags">
                {entryRoomNumber === selectedRoom.number && <span>Entrada</span>}
                {entryRoomNumber !== selectedRoom.number && (
                  <span className="room-inspector-empty">
                    Sem marcador de acesso disponível neste inspetor.
                  </span>
                )}
              </div>
            </section>
            {selectedRoom.liquidType && (
              <section className="room-inspector-section">
                <h4>Elemento especial</h4>
                <div className="room-inspector-tags">
                  <span className={selectedRoom.liquidType === "lava" ? "lava-room-badge" : "water-room-badge"}>
                    {selectedRoom.liquidFeature
                      ? liquidFeatureLabels[selectedRoom.liquidType][selectedRoom.liquidFeature]
                      : selectedRoom.liquidType === "water" ? "Água" : "Lava"}
                  </span>
                </div>
              </section>
            )}
            {selectedMapElements.length > 0 && (
              <section className="room-inspector-section">
                <h4>Elementos internos</h4>
                <ul className="room-inspector-feature-list">
                  {selectedMapElements.map((element) => (
                    <li key={element.id}>
                      <strong>{element.label}</strong>
                      <small>{element.detail}</small>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {selectedRoom.traps.length > 0 && (
              <section className="room-inspector-section">
                <h4>Armadilhas · {selectedRoom.traps.length}</h4>
                <ul className="room-inspector-feature-list">
                  {selectedRoom.traps.map((trap, index) => (
                    <li key={`${trap}-${index}`}>{TRAP_DEFINITIONS[trap].label}</li>
                  ))}
                </ul>
              </section>
            )}
            {selectedRoom.treasures.length > 0 && (
              <section className="room-inspector-section">
                <h4>Tesouros · {selectedRoom.treasures.length}</h4>
                <ul className="room-inspector-feature-list">
                  {selectedRoom.treasures.map((treasure, index) => {
                    const definition = getTreasureDefinition(treasure.type);
                    return (
                      <li key={`${treasure.type}-${index}`}>
                        <strong>{definition?.label ?? "Tesouro"}</strong>
                        <small>
                          {TREASURE_CATEGORY_LABELS[treasure.category]}
                          {treasure.rarity ? ` · ${TREASURE_RARITY_LABELS[treasure.rarity]}` : ""}
                        </small>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <section className="room-inspector-section">
              <h4>Conexões · {selectedConnections.length}</h4>
              {selectedConnections.length > 0 ? (
                <ul className="room-inspector-connections">
                  {selectedConnections.map((connection, index) => {
                    const connectedRoom = roomByNumber.get(connection.roomNumber);
                    if (!connectedRoom) return null;
                    return (
                      <li key={`${connection.roomNumber}-${connection.connectionType}-${index}`}>
                        <button
                          type="button"
                          onClick={() => onSelectRoom(connection.roomNumber)}
                          aria-label={`Inspecionar sala ${connection.roomNumber}: ${connectedRoom.roomType.title}`}
                        >
                          <span className="room-connection-number">
                            {connection.roomNumber.toString().padStart(2, "0")}
                          </span>
                          <span>
                            <strong>{connectedRoom.roomType.title}</strong>
                            <small>{getConnectionLabel(connection)}</small>
                          </span>
                          <span aria-hidden="true">›</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="room-inspector-empty">
                  Nenhuma conexão direta foi identificada nos dados desta sala.
                </p>
              )}
            </section>
            <p className="room-inspector-note">
              Encontros e observações narrativas não estão registrados nos dados desta sala.
            </p>
            <div className="room-inspector-actions">
              <button
                className="room-guide-action room-guide-locate"
                type="button"
                onClick={() => onLocateRoom(selectedRoom.number)}
              >
                Localizar no mapa
              </button>
              <button
                className="room-guide-action"
                type="button"
                onClick={() => onOpenFullDetails(selectedRoom.number)}
              >
                Ficha completa
              </button>
            </div>
          </div>
        ) : (
          <div className="room-empty">
            <strong>Selecione uma sala</strong>
            <p>Escolha uma sala na lista para ver seus dados e conexões.</p>
          </div>
        )}
      </div>
    </section>
  );
}
