"""Prepare the accepted two-half gate from its untouched Meshy GLB. Run at repo root."""

import copy
import json
import struct
from pathlib import Path

ART = Path(__file__).resolve().parent
SOURCE = ART / "lane-gate-generated-07.glb"
OUTPUT = ART / "lane-gate-model-07.glb"


def main():
    source = SOURCE.read_bytes()
    magic, version, size = struct.unpack_from("<III", source)
    assert magic == 0x46546C67 and version == 2 and size == len(source)
    json_length, kind = struct.unpack_from("<II", source, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(source[20 : 20 + json_length])
    binary_offset = 20 + json_length
    binary_length, kind = struct.unpack_from("<II", source, binary_offset)
    assert kind == 0x004E4942
    binary = bytearray(source[binary_offset + 8 : binary_offset + 8 + binary_length])

    def read(accessor_id):
        accessor = doc["accessors"][accessor_id]
        assert not accessor.get("sparse") and not accessor.get("normalized")
        view = doc["bufferViews"][accessor["bufferView"]]
        components = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[accessor["type"]]
        scalar = {5126: "f", 5125: "I", 5123: "H"}[accessor["componentType"]]
        fmt = "<" + scalar * components
        stride = view.get("byteStride", struct.calcsize(fmt))
        offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        return [struct.unpack_from(fmt, binary, offset + i * stride) for i in range(accessor["count"])]

    def append(values, type_name, component_type=5126, target=None):
        while len(binary) % 4:
            binary.append(0)
        fmt = "<" + ("f" if component_type == 5126 else "I") * len(values[0])
        packed = b"".join(struct.pack(fmt, *row) for row in values)
        view = {"buffer": 0, "byteOffset": len(binary), "byteLength": len(packed)}
        if target is not None:
            view["target"] = target
        view_id = len(doc["bufferViews"])
        doc["bufferViews"].append(view)
        binary.extend(packed)
        accessor = {
            "bufferView": view_id,
            "componentType": component_type,
            "count": len(values),
            "type": type_name,
            "min": [min(row[i] for row in values) for i in range(len(values[0]))],
            "max": [max(row[i] for row in values) for i in range(len(values[0]))],
        }
        accessor_id = len(doc["accessors"])
        doc["accessors"].append(accessor)
        return accessor_id

    # Fail rather than silently process a different generation or topology.
    assert len(doc["nodes"]) == 1 and len(doc["meshes"]) == 1
    assert doc["nodes"][0]["matrix"] == [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    assert len(doc["meshes"][0]["primitives"]) == 1
    primitive = doc["meshes"][0]["primitives"][0]
    assert primitive.get("mode", 4) == 4
    attributes = {name: read(index) for name, index in primitive["attributes"].items()}
    positions = attributes["POSITION"]
    indices = [row[0] for row in read(primitive["indices"])]
    halves = {"LeftHalf": [], "RightHalf": []}
    for i in range(0, len(indices), 3):
        triangle = indices[i : i + 3]
        xs = [positions[j][0] for j in triangle]
        assert max(xs) < 0 or min(xs) > 0, "Triangle bridges the empty passage"
        halves["LeftHalf" if max(xs) < 0 else "RightHalf"].extend(triangle)

    height = max(p[1] for p in positions) - min(p[1] for p in positions)
    left_inner = max(positions[i][0] for i in halves["LeftHalf"])
    right_inner = min(positions[i][0] for i in halves["RightHalf"])
    source_gap = right_inner - left_inner
    closed_gap = height * 0.012
    open_gap = height * 0.70
    center_x = (left_inner + right_inner) / 2
    center_y = (max(p[1] for p in positions) + min(p[1] for p in positions)) / 2
    center_z = (max(p[2] for p in positions) + min(p[2] for p in positions)) / 2
    doc["nodes"] = [{"name": "LaneGate", "children": [1, 2]}]
    doc["meshes"] = []
    channels, samplers = [], []
    times = append([(0.0,), (1.5,)], "SCALAR")
    statistics = {}
    for name, original_indices in halves.items():
        unique = sorted(set(original_indices))
        remap = {old: new for new, old in enumerate(unique)}
        side = -1 if name == "LeftHalf" else 1
        bounds = [[min(positions[i][a] for i in unique), max(positions[i][a] for i in unique)] for a in range(3)]
        pivot = [(lo + hi) / 2 for lo, hi in bounds]
        attr_ids = {}
        for attr_name, rows in attributes.items():
            values = [rows[i] for i in unique]
            if attr_name == "POSITION":
                values = [tuple(p[a] - pivot[a] for a in range(3)) for p in values]
            attr_ids[attr_name] = append(values, "VEC" + str(len(values[0])), target=34962)
        index_id = append([(remap[i],) for i in original_indices], "SCALAR", 5125, 34963)
        new_primitive = copy.deepcopy(primitive)
        new_primitive.update(attributes=attr_ids, indices=index_id)
        doc["meshes"].append({"name": name, "primitives": [new_primitive]})
        def translation(gap):
            return [pivot[0] - center_x + side * (gap - source_gap) / 2, pivot[1] - center_y, pivot[2] - center_z]
        closed, opened = translation(closed_gap), translation(open_gap)
        node_id = len(doc["nodes"])
        doc["nodes"].append({"name": name, "mesh": len(doc["meshes"]) - 1, "translation": opened})
        output = append([closed, opened], "VEC3")
        samplers.append({"input": times, "output": output, "interpolation": "LINEAR"})
        channels.append({"sampler": len(samplers) - 1, "target": {"node": node_id, "path": "translation"}})
        statistics[name] = {"triangles": len(original_indices) // 3, "vertices": len(unique), "closed": closed, "open": opened}
    doc["scenes"] = [{"name": "LaneGate", "nodes": [0]}]
    doc["scene"] = 0
    doc["animations"] = [{"name": "Open", "samplers": samplers, "channels": channels}]
    doc["materials"][0]["name"] = "manufactured-01_generated_atlas"
    doc["extras"] = {
        "styleProfile": "manufactured-01",
        "styleRevision": 1,
        "sourceTask": "01a141b1-d0a3-726c-b0c3-72026ea0f5c1",
        "openGap": open_gap,
        "closedGap": closed_gap,
        "height": height,
        "note": "Two independent rigid halves. Portal effect excluded. Shared material roles still need masks or reassignment.",
    }
    doc["asset"]["generator"] = "Meshy T2; Hexaverse two-half preparation 07"
    doc["buffers"][0]["byteLength"] = len(binary)
    json_bytes = json.dumps(doc, separators=(",", ":")).encode()
    json_bytes += b" " * (-len(json_bytes) % 4)
    binary.extend(b"\0" * (-len(binary) % 4))
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    OUTPUT.write_bytes(struct.pack("<III", magic, 2, total) + struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes + struct.pack("<II", len(binary), 0x004E4942) + binary)
    statistics.update(totalTriangles=len(indices) // 3, openGap=open_gap, closedGap=closed_gap, height=height)
    (ART / "lane-gate-model-07.stats.json").write_text(json.dumps(statistics, indent=2) + "\n")
    print(json.dumps(statistics, indent=2))


if __name__ == "__main__":
    main()
