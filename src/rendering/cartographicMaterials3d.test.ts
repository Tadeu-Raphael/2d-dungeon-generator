import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createCartographicTextureSet3D } from "./cartographicMaterials3d";

function getPixelData(texture: THREE.DataTexture): Uint8Array {
  const { data } = texture.image;
  if (!(data instanceof Uint8Array)) throw new Error("Expected generated texture pixel data.");
  return data;
}

describe("3D cartographic material textures", () => {
  it("creates deterministic, repeatable relief maps for each surface", () => {
    const first = createCartographicTextureSet3D();
    const second = createCartographicTextureSet3D();
    const textures = Object.values(first);

    expect(textures).toHaveLength(13);
    for (const texture of textures) {
      expect(texture).toBeInstanceOf(THREE.DataTexture);
      expect(texture.image.width).toBe(64);
      expect(texture.image.height).toBe(64);
      expect(texture.wrapS).toBe(THREE.RepeatWrapping);
      expect(texture.wrapT).toBe(THREE.RepeatWrapping);
    }

    expect(first.floor.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(first.floorBump.colorSpace).toBe(THREE.NoColorSpace);
    expect(Buffer.from(getPixelData(first.floor)).equals(Buffer.from(getPixelData(second.floor)))).toBe(true);
    expect(Buffer.from(getPixelData(first.wall)).equals(Buffer.from(getPixelData(first.wood)))).toBe(false);
    expect(Buffer.from(getPixelData(first.water)).equals(Buffer.from(getPixelData(first.lava)))).toBe(false);
    expect(new Set(getPixelData(first.floor).filter((_, index) => index % 4 === 0)).size).toBeGreaterThan(8);

    for (const texture of Object.values(first)) texture.dispose();
    for (const texture of Object.values(second)) texture.dispose();
  });
});
