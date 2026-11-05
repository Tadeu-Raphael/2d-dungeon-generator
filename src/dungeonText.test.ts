import { describe, expect, it } from "vitest";
import {
  RECTANGULAR_ROOM_RATIO_DEFINITIONS,
  ROOM_SHAPE_DEFINITIONS,
  ROOM_SIZE_CATEGORIES,
} from "./core/generation/roomOptions";
import {
  TRAP_CATEGORY_LABELS,
  TRAP_DEFINITIONS,
} from "./dungeon";

const userFacingText = [
  ...Object.values(TRAP_DEFINITIONS).flatMap(({ label, description }) => [label, description]),
  ...Object.values(TRAP_CATEGORY_LABELS),
  ...ROOM_SHAPE_DEFINITIONS.flatMap(({ label, characteristics, applications }) => [
    label,
    characteristics,
    applications,
  ]),
  ...ROOM_SIZE_CATEGORIES.flatMap(({ label, dimensions, area, usage }) => [
    label,
    dimensions,
    area,
    usage,
  ]),
  ...RECTANGULAR_ROOM_RATIO_DEFINITIONS.flatMap(({ characteristic, example }) => [
    characteristic,
    example,
  ]),
].join(" ");

describe("generator text encoding", () => {
  it("keeps Portuguese trap descriptions readable", () => {
    expect(TRAP_DEFINITIONS.overheatedChamber).toMatchObject({
      label: "Câmara superaquecida",
      description: "A temperatura sobe até tornar a permanência perigosa.",
    });
    expect(TRAP_CATEGORY_LABELS.magical).toBe("Mágicas");
  });

  it("keeps room dimensions and areas readable", () => {
    expect(ROOM_SIZE_CATEGORIES[0]).toMatchObject({
      dimensions: "2–4 m por lado",
      area: "4–16 m²",
    });
    expect(RECTANGULAR_ROOM_RATIO_DEFINITIONS[0].example).toBe("8 × 8 m");
  });

  it("contains no common UTF-8 mojibake in generator copy", () => {
    expect(userFacingText).not.toMatch(
      /(?:\u00c3[\u0080-\u00ff\u2018-\u201f]|\u00c2[\u0080-\u00ff]|\u00e2\u20ac[\u2018-\u201f])/,
    );
  });
});
