/** Offline thumbnail rendering only; never import this module into HUD components. */
import * as THREE from 'three'
import { createRendererCandidate } from '@/components/render-guard/renderer-candidate'
import { createPlanetModel } from '@/components/space/webgl/scene-art'
import { createSpacecraftModel, loadSpacecraftAsset } from '@/components/space/webgl/spacecraft-art'
import { createLaneGateModel, loadLaneGateAsset } from '@/components/space/webgl/lane-gate-art'
import { createFeatureModel, featureArtKind } from '@/components/space/webgl/feature-art'
import { rockGeometry } from '@/components/space/webgl/SpaceWorld'
import { createStarModel } from '@/components/space/webgl/star-art'
import { addPreviewLights, disposeObjectResources } from '@/components/graphics/scene-resources'

export type ThumbnailKind = 'fleet' | 'station' | 'rocky' | 'gas_giant' | 'ice' | 'moon' | 'star' | 'resource-site' | 'gate' | 'anomaly' | 'ruin' | 'nebula' | 'gravity_well' | 'debris' | 'radiation'

export async function renderHudThumbnail(kind: ThumbnailKind, canvas: HTMLCanvasElement) {
  const scene = new THREE.Scene()
  addPreviewLights(scene)
  let source: THREE.Group | undefined

  const feature = featureArtKind(kind)
  if (kind === 'gate') {
    source = await loadLaneGateAsset()
    const gate = createLaneGateModel(source)
    // World art faces the overhead camera; return its aperture to the preview view.
    gate.rotation.x = Math.PI / 2
    scene.add(gate)
  } else if (feature) {
    scene.add(createFeatureModel(feature, `hud-${kind}-1`))
  } else if (kind === 'fleet' || kind === 'station') {
    const modelKind = kind === 'fleet' ? 'ship' : 'station'
    source = await loadSpacecraftAsset(modelKind)
    scene.add(createSpacecraftModel(modelKind, 0x4fce92, source))
  } else if (kind === 'star') {
    const star = createStarModel({ objectId: 'hud-star-g', starClass: 'G', geometry: new THREE.SphereGeometry(0.85, 48, 32) })
    // Fit the existing corona inside the icon crop instead of clipping its edge.
    for (const child of star.mesh.children) if (child instanceof THREE.Sprite) child.scale.set(2.1, 2.1, 1)
    scene.add(star.mesh)
  } else if (kind === 'rocky' || kind === 'gas_giant' || kind === 'ice' || kind === 'moon') {
    // Fixed representatives from the existing seeded surface families; rocky-1
    // selects a dry surface. Clouds/plasma are captured at their initial time.
    scene.add(createPlanetModel(kind, `hud-${kind}-1`, new THREE.SphereGeometry(0.85, 48, 32)))
  } else {
    // A representative cluster using the world's rock geometry/material, not
    // a picture of a particular observed belt or a count of its members.
    const poses = [
      [-0.4, 0.25, 0, 0.45], [0.4, 0.3, 0.1, 0.3],
      [0.1, -0.4, 0.15, 0.34], [-0.5, -0.3, -0.25, 0.2],
    ]
    for (const [index, [x, y, z, size]] of poses.entries()) {
      const rock = new THREE.Mesh(rockGeometry(1024 + index), new THREE.MeshStandardMaterial({
        color: 0xafa291, vertexColors: true, roughness: 0.9, metalness: 0.04, flatShading: true,
      }))
      rock.position.set(x!, y!, z!)
      rock.scale.setScalar(size!)
      rock.rotation.set(index * 0.7, index * 1.1, index * 0.4)
      scene.add(rock)
    }
  }

  const camera = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, 0.01, 100)
  camera.position.set(3, 2, -3)
  // Fractured architecture and detached hull sections need their broad plate
  // faces in the tiny crop; the low general-purpose angle reduced them to slivers.
  // Match the elevated gameplay view without altering gate/celestial captures.
  if (kind === 'ruin' || kind === 'debris') camera.position.set(2.4, 4.2, -3)
  camera.lookAt(0, 0, 0)
  if (feature || kind === 'gate') {
    // Fit the new compositions in camera space so thin silhouettes remain readable
    // at the actual 32px display size, without changing accepted celestial crops.
    camera.updateMatrixWorld(true)
    const projected = new THREE.Box3().setFromObject(scene).applyMatrix4(camera.matrixWorldInverse)
    const size = projected.getSize(new THREE.Vector3())
    const half = Math.max(size.x, size.y) * 0.55
    if (Number.isFinite(half) && half > 0) {
      camera.left = camera.bottom = -half
      camera.right = camera.top = half
      camera.updateProjectionMatrix()
    }
  }
  const renderer = createRendererCandidate({ canvas, alpha: true, stencil: false, forceWebGL: true })
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    renderer.dispose()
    disposeObjectResources(scene)
    if (source) disposeObjectResources(source, true)
  }
  try {
    await renderer.init()
    renderer.resize(128, 128, 1)
    renderer.setClearColor(0, 0)
    await renderer.render(scene, camera)
    // Capture first, then release explicitly through the shared resource helper.
    return dispose
  } catch (error) { dispose(); throw error }
}
