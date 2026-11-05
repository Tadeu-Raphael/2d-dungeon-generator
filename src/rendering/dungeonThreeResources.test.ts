import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { disposeDungeonThreeGroup } from "./dungeonThreeResources";

describe("Three.js scene resource disposal", () => {
  it("disposes instanced buffers and shared scene resources", () => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const texture = new THREE.Texture();
    const bumpTexture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    material.bumpMap = bumpTexture;
    const floor = new THREE.InstancedMesh(geometry, material, 1);
    const floorDispose = vi.spyOn(floor, "dispose");
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");
    const bumpTextureDispose = vi.spyOn(bumpTexture, "dispose");
    const ownedTexture = new THREE.Texture();
    const ownedTextureDispose = vi.spyOn(ownedTexture, "dispose");
    const badgeTexture = new THREE.Texture();
    const badgeMaterial = new THREE.SpriteMaterial({ map: badgeTexture });
    const badgeDispose = vi.spyOn(badgeMaterial, "dispose");
    const badgeTextureDispose = vi.spyOn(badgeTexture, "dispose");

    group.userData.ownedTextures = [ownedTexture];
    group.add(floor, new THREE.Sprite(badgeMaterial));
    disposeDungeonThreeGroup(group);

    expect(floorDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(bumpTextureDispose).toHaveBeenCalledOnce();
    expect(ownedTextureDispose).toHaveBeenCalledOnce();
    expect(badgeDispose).toHaveBeenCalledOnce();
    expect(badgeTextureDispose).toHaveBeenCalledOnce();
  });
});
