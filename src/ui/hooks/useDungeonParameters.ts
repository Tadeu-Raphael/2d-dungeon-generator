import { useCallback, useState } from "react";
import {
  DEFAULT_DUNGEON_PARAMETERS,
  type DungeonParameters,
  MAX_DUNGEON_HEIGHT,
  MAX_DUNGEON_SEED,
  MAX_DUNGEON_WIDTH,
  MIN_DUNGEON_DIMENSION,
  isSupportedDungeonDimensions,
  getDimensionValidationMessage,
} from "../../dungeon";
import type {
  RoomShapeFrequencies,
  RoomSizeCategoryKey,
  RectangularRoomRatioKey,
  RoomTypeCategory,
  TrapCategory,
  TreasureCategory,
  TreasureRarity,
} from "../../dungeon";
import { redistributeFrequencies } from "../../dungeon";

export function useDungeonParameters() {
  const [parameters, setParameters] = useState<DungeonParameters>(
    DEFAULT_DUNGEON_PARAMETERS
  );
  const [seed, setSeed] = useState<number>(
    Math.floor(Math.random() * 900_000_000) + 100_000_000
  );
  const [seedDraft, setSeedDraft] = useState(String(seed));
  const [widthDraft, setWidthDraft] = useState(
    String(DEFAULT_DUNGEON_PARAMETERS.width)
  );
  const [heightDraft, setHeightDraft] = useState(
    String(DEFAULT_DUNGEON_PARAMETERS.height)
  );
  const [dimensionDraftError, setDimensionDraftError] = useState<string>();
  const [seedDraftError, setSeedDraftError] = useState<string>();

  const updateDimensionDraft = useCallback(
    (key: "width" | "height", value: string) => {
      if (key === "width") setWidthDraft(value);
      else setHeightDraft(value);

      const parsed = Number(value);
      const nextWidth = key === "width" ? parsed : parameters.width;
      const nextHeight = key === "height" ? parsed : parameters.height;
      if (isSupportedDungeonDimensions(nextWidth, nextHeight)) {
        setDimensionDraftError(undefined);
        setParameters((current) => ({ ...current, [key]: parsed }));
      } else {
        setDimensionDraftError(
          getDimensionValidationMessage(nextWidth, nextHeight)
        );
      }
    },
    [parameters]
  );

  const updateSeedDraft = useCallback((value: string) => {
    setSeedDraft(value);
    if (!/^\d+$/.test(value)) {
      setSeedDraftError(`Informe um número inteiro entre 0 e ${MAX_DUNGEON_SEED}.`);
      return;
    }
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed <= MAX_DUNGEON_SEED) {
      setSeedDraftError(undefined);
    } else {
      setSeedDraftError(`A seed deve estar entre 0 e ${MAX_DUNGEON_SEED}.`);
    }
  }, []);

  const commitSeedDraft = useCallback(() => {
    const parsed = Number(seedDraft);
    if (
      /^\d+$/.test(seedDraft) &&
      Number.isSafeInteger(parsed) &&
      parsed <= MAX_DUNGEON_SEED
    ) {
      setSeed(parsed);
      setSeedDraft(String(parsed));
      setSeedDraftError(undefined);
    } else {
      setSeedDraftError(`Informe um número inteiro entre 0 e ${MAX_DUNGEON_SEED}.`);
    }
  }, [seedDraft]);

  const commitDimension = useCallback(
    (key: "width" | "height") => {
      const draft = key === "width" ? widthDraft : heightDraft;
      const parsed = Number(draft);
      const maximum =
        key === "width" ? MAX_DUNGEON_WIDTH : MAX_DUNGEON_HEIGHT;
      const value = Number.isFinite(parsed)
        ? Math.min(maximum, Math.max(MIN_DUNGEON_DIMENSION, Math.round(parsed)))
        : parameters[key];
      const nextWidth =
        key === "width" ? value : parameters.width;
      const nextHeight =
        key === "height" ? value : parameters.height;
      if (!isSupportedDungeonDimensions(nextWidth, nextHeight)) {
        setDimensionDraftError(
          getDimensionValidationMessage(nextWidth, nextHeight)
        );
        return;
      }
      if (key === "width") setWidthDraft(String(value));
      else setHeightDraft(String(value));
      setDimensionDraftError(undefined);
      setParameters((current) => ({ ...current, [key]: value }));
    },
    [parameters, widthDraft, heightDraft]
  );

  const updateRoomShapeFrequency = useCallback(
    (key: keyof RoomShapeFrequencies, value: number) => {
      setParameters((current) => ({
        ...current,
        roomShapeFrequencies: redistributeFrequencies(
          current.roomShapeFrequencies,
          [
            "rectangular",
            "square",
            "round",
            "elliptical",
            "octagonal",
            "lShaped",
            "tShaped",
            "crossShaped",
            "ringShaped",
            "irregular",
            "columns",
            "alcoves",
            "multiLevel",
          ] as const,
          key,
          value,
        ),
      }));
    },
    []
  );

  const updateRoomSizeFrequency = useCallback(
    (key: RoomSizeCategoryKey, value: number) => {
      setParameters((current) => ({
        ...current,
        roomSizeFrequencies: redistributeFrequencies(
          current.roomSizeFrequencies,
          [
            "micro",
            "verySmall",
            "small",
            "medium",
            "large",
            "veryLarge",
            "colossal",
          ] as readonly RoomSizeCategoryKey[],
          key,
          value,
        ),
      }));
    },
    []
  );

  const updateRoomRatioFrequency = useCallback(
    (key: RectangularRoomRatioKey, value: number) => {
      setParameters((current) => ({
        ...current,
        rectangularRoomRatioFrequencies: redistributeFrequencies(
          current.rectangularRoomRatioFrequencies,
          [
            "square",
            "slightlyElongated",
            "elongated",
            "veryElongated",
            "gallery",
          ] as readonly RectangularRoomRatioKey[],
          key,
          value,
        ),
      }));
    },
    []
  );

  const updateRoomTypeFrequency = useCallback(
    (key: RoomTypeCategory, value: number) => {
      setParameters((current) => ({
        ...current,
        roomTypeCategoryFrequencies: redistributeFrequencies(
          current.roomTypeCategoryFrequencies,
          [
            "exploration",
            "combat",
            "habitation",
            "logistics",
            "religious",
            "arcane",
            "funerary",
            "natural",
            "puzzle",
            "treasure",
            "special",
          ] as readonly RoomTypeCategory[],
          key,
          value,
        ),
      }));
    },
    []
  );

  const updateTrapCategoryFrequency = useCallback(
    (key: TrapCategory, value: number) => {
      setParameters((current) => ({
        ...current,
        trapCategoryWeights: redistributeFrequencies(
          current.trapCategoryWeights,
          [
            "mechanical",
            "environmental",
            "magical",
            "capture",
            "deception",
            "motion",
            "biological",
            "combat",
            "complex",
          ] as readonly TrapCategory[],
          key,
          value,
        ),
      }));
    },
    []
  );

  const updateTreasureCategoryFrequency = useCallback(
    (key: TreasureCategory, value: number) => {
      setParameters((current) => ({
        ...current,
        treasureCategoryWeights: redistributeFrequencies(
          current.treasureCategoryWeights,
          [
            "monetary",
            "equipment",
            "consumables",
            "magical",
            "relics",
            "documents",
            "materials",
            "creatureTrophies",
            "cursed",
            "secret",
          ] as readonly TreasureCategory[],
          key,
          value,
        ),
      }));
    },
    []
  );

  const updateTreasureRarityFrequency = useCallback(
    (key: TreasureRarity, value: number) => {
      setParameters((current) => ({
        ...current,
        treasureRarityWeights: redistributeFrequencies(
          current.treasureRarityWeights,
          [
            "common",
            "uncommon",
            "rare",
            "veryRare",
            "legendary",
          ] as readonly TreasureRarity[],
          key,
          value,
        ),
      }));
    },
    []
  );

  return {
    parameters,
    setParameters,
    seed,
    setSeed,
    seedDraft,
    setSeedDraft,
    widthDraft,
    setWidthDraft,
    heightDraft,
    setHeightDraft,
    dimensionDraftError,
    setDimensionDraftError,
    seedDraftError,
    setSeedDraftError,
    updateDimensionDraft,
    updateSeedDraft,
    commitSeedDraft,
    commitDimension,
    updateRoomShapeFrequency,
    updateRoomSizeFrequency,
    updateRoomRatioFrequency,
    updateRoomTypeFrequency,
    updateTrapCategoryFrequency,
    updateTreasureCategoryFrequency,
    updateTreasureRarityFrequency,
  };
}