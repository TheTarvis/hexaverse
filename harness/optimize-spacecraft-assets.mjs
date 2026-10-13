// Run from repository root: node harness/optimize-spacecraft-assets.mjs <raw-directory>
// Offline, deliberately narrow importer for the two static Meshy GLBs. No network.
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(path.resolve('frontend/package.json'))
const sharp = require('sharp')
const input = process.argv[2]
if (!input) throw new Error('Pass the directory containing ship-raw.glb and station-raw.glb')
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const pad = bytes => Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4)])
for (const [kind, filename] of [['ship', 'utility-ship'], ['station', 'orbital-station']]) {
  const original = await fs.readFile(path.join(input, `${kind}-raw.glb`))
  if (original.readUInt32LE(0) !== 0x46546c67 || original.readUInt32LE(4) !== 2) throw new Error('Expected GLB 2')
  const jsonLength = original.readUInt32LE(12)
  const json = JSON.parse(original.subarray(20, 20 + jsonLength).toString())
  const binary = original.subarray(28 + jsonLength)
  if (json.animations || json.skins || json.cameras || json.extensionsUsed?.length || json.buffers.some(b => b.uri) || json.images.some(i => i.uri)) throw new Error('Expected static self-contained asset')
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  if (json.nodes.length !== 1 || JSON.stringify(json.nodes[0].matrix) !== JSON.stringify(identity)) throw new Error('Unexpected source transform')
  const views = json.bufferViews.map(v => Buffer.from(binary.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)))
  const primitive = json.meshes[0].primitives[0]
  const positions = json.accessors[primitive.attributes.POSITION]
  const normals = json.accessors[primitive.attributes.NORMAL]
  const read = accessor => {
    if (accessor.componentType !== 5126 || accessor.type !== 'VEC3' || json.bufferViews[accessor.bufferView].byteStride) throw new Error('Expected tightly packed float vectors')
    return Array.from({ length: accessor.count }, (_, i) => Array.from({ length: 3 }, (_, a) => views[accessor.bufferView].readFloatLE((accessor.byteOffset ?? 0) + i * 12 + a * 4)))
  }
  const rotate = ([x, y, z]) => kind === 'ship' ? [-z, y, x] : [x, y, z]
  const points = read(positions).map(rotate)
  const center = [0, 1, 2].map(a => (Math.min(...points.map(p => p[a])) + Math.max(...points.map(p => p[a]))) / 2)
  const centered = points.map(p => p.map((value, a) => value - center[a]))
  const radius = Math.max(...centered.map(p => Math.hypot(...p)))
  if (!Number.isFinite(radius) || radius <= 0) throw new Error('Invalid geometry bounds')
  const normalized = centered.map(p => p.map(value => value / radius))
  const write = (accessor, vectors) => {
    vectors.forEach((p, i) => p.forEach((v, a) => views[accessor.bufferView].writeFloatLE(v, (accessor.byteOffset ?? 0) + i * 12 + a * 4)))
    accessor.min = [0, 1, 2].map(a => Math.min(...vectors.map(p => p[a])))
    accessor.max = [0, 1, 2].map(a => Math.max(...vectors.map(p => p[a])))
  }
  write(positions, normalized)
  write(normals, read(normals).map(rotate))
  // Moderate metal response preserves silver plates under the system's
  // ambient/star lights, which do not provide an environment reflection map.
  for (const material of json.materials) {
    material.pbrMetallicRoughness.metallicFactor = 0.35
    material.emissiveFactor = [0.28, 0.28, 0.28]
    material.emissiveTexture = { ...material.pbrMetallicRoughness.baseColorTexture }
  }
  const imageSizes = []
  for (const image of json.images) {
    const resized = await sharp(views[image.bufferView]).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()
    views[image.bufferView] = resized
    image.mimeType = 'image/jpeg'
    const metadata = await sharp(resized).metadata()
    imageSizes.push([metadata.width, metadata.height])
  }
  let offset = 0
  const chunks = views.map((bytes, i) => {
    json.bufferViews[i].byteOffset = offset
    json.bufferViews[i].byteLength = bytes.length
    const padded = pad(bytes); offset += padded.length
    return padded
  })
  json.buffers[0].byteLength = offset
  json.asset.extras = { source: 'Meshy meshy-t2', processing: 'harness/optimize-spacecraft-assets.mjs', orientation: 'Y up; ship forward -Z; station ring XZ' }
  const encoded = Buffer.from(JSON.stringify(json))
  const jsonChunk = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 32)])
  const binChunk = Buffer.concat(chunks)
  const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8)
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonChunk.length + binChunk.length, 8)
  jsonHeader.writeUInt32LE(jsonChunk.length); jsonHeader.writeUInt32LE(0x4e4f534a, 4)
  binHeader.writeUInt32LE(binChunk.length); binHeader.writeUInt32LE(0x004e4942, 4)
  const output = Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk])
  const triangles = json.meshes.flatMap(m => m.primitives).reduce((sum, p) => sum + json.accessors[p.indices].count / 3, 0)
  const draws = json.meshes.reduce((sum, m) => sum + m.primitives.length, 0)
  if (output.length > 5 * 1024 * 1024 || triangles + 384 > 40000 || draws + 1 > 12 || json.materials.length + 1 > 8 || json.images.length > 4) throw new Error('Asset exceeds model plus accent budget')
  const destination = `frontend/public/models/space/${filename}.glb`
  await fs.writeFile(destination, output)
  console.log(JSON.stringify({ kind, destination, sourceBytes: original.length, sourceSha256: digest(original), bytes: output.length, sha256: digest(output), triangles, draws, materials: json.materials.length, images: imageSizes, normalizedRadius: 1, orientation: kind === 'ship' ? 'source -X rotated Y -90 degrees to -Z' : 'source XZ ring preserved' }))
}
