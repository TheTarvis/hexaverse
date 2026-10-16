// Run from repo root: node harness/utilities/prepare-feature-asset.mjs <raw.glb> <output.glb>
// Preserve generated geometry/material slots; bound embedded textures for game delivery.
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import crypto from 'node:crypto'
const require = createRequire(path.resolve('frontend/package.json'))
const sharp = require('sharp')
const [input, output] = process.argv.slice(2)
if (!input || !output || path.resolve(input) === path.resolve(output)) throw new Error('Provide distinct input and output GLB paths')
const source = await fs.readFile(input)
if (source.readUInt32LE(0) !== 0x46546c67 || source.readUInt32LE(4) !== 2) throw new Error('Expected GLB 2')
const jsonLength = source.readUInt32LE(12)
const gltf = JSON.parse(source.subarray(20, 20 + jsonLength).toString())
if (gltf.buffers.length !== 1 || gltf.buffers[0].uri || gltf.images?.some(image => image.uri)) throw new Error('Expected self-contained GLB')
const bin = source.subarray(28 + jsonLength)
const views = gltf.bufferViews.map(view => Buffer.from(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)))
for (const image of gltf.images ?? []) {
 const metadata = await sharp(views[image.bufferView]).metadata()
 const resized = sharp(views[image.bufferView]).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
 views[image.bufferView] = await (metadata.hasAlpha ? resized.png() : resized.jpeg({ quality: 90 })).toBuffer()
 image.mimeType = metadata.hasAlpha ? 'image/png' : 'image/jpeg'
}
let offset = 0
const chunks = views.map((bytes, index) => {
 gltf.bufferViews[index].byteOffset = offset
 gltf.bufferViews[index].byteLength = bytes.length
 const padded = Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4)])
 offset += padded.length
 return padded
})
gltf.buffers[0].byteLength = offset
const triangles = gltf.meshes.flatMap(mesh => mesh.primitives).reduce((sum, primitive) => sum + gltf.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3, 0)
if (triangles > 20000) throw new Error('Feature triangle budget exceeded')
gltf.asset.extras = { ...gltf.asset.extras, source: 'Meshy T2', processing: 'harness/utilities/prepare-feature-asset.mjs' }
const encoded = Buffer.from(JSON.stringify(gltf))
const json = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 32)])
const binary = Buffer.concat(chunks)
const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8)
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + binary.length, 8)
jsonHeader.writeUInt32LE(json.length); jsonHeader.writeUInt32LE(0x4e4f534a, 4)
binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4)
const result = Buffer.concat([header, jsonHeader, json, binHeader, binary])
if (result.length > 5 * 1024 * 1024) throw new Error('Feature file exceeds 5 MiB budget')
await fs.writeFile(output, result)
console.log(JSON.stringify({ input, output, triangles, sourceBytes: source.length, bytes: result.length, sha256: crypto.createHash('sha256').update(result).digest('hex'), materials: gltf.materials?.length ?? 0, images: gltf.images?.length ?? 0 }))
