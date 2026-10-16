import { expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { disposeObjectResources } from './scene-resources'

it('releases shared mesh, sprite and scene resources once', () => {
  const scene = new THREE.Scene()
  const geometry = new THREE.BoxGeometry()
  const texture = new THREE.Texture()
  const material = new THREE.MeshStandardMaterial({ map: texture })
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture })
  scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material), new THREE.Sprite(spriteMaterial))
  scene.background = texture
  scene.environment = texture
  const releases = [geometry, texture, material, spriteMaterial].map(resource => vi.spyOn(resource, 'dispose'))
  disposeObjectResources(scene)
  releases.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1))
})
