import * as THREE from "three";

export function disposeDungeonThreeGroup(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const collectMaterial = (material: THREE.Material): void => {
    materials.add(material);
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) textures.add(value);
    }
  };

  group.traverse((object) => {
    const ownedTextures = object.userData.ownedTextures;
    if (Array.isArray(ownedTextures)) {
      for (const texture of ownedTextures) {
        if (texture instanceof THREE.Texture) textures.add(texture);
      }
    }
    if (object instanceof THREE.InstancedMesh) object.dispose();
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.forEach(collectMaterial);
    } else if (object instanceof THREE.Sprite) {
      collectMaterial(object.material);
    }
  });

  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
