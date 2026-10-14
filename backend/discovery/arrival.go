package discovery

import "hexaverse/action"

// ArrivalWrites composes discovery's historical credit into the caller's
// resolution transaction without exposing discovery storage rules to travel.
// Like chart arrival effects, it needs no dependencies on the service value.
func (*Service) ArrivalWrites(r action.Resolution, gid, sid, cid string) ([]action.DocWrite, error) {
	path := []string{Collection, Key(gid, sid, "feat-star")}
	var record Record
	if _, err := r.ReadDocument(path, &record); err != nil {
		return nil, err
	}
	if record.FirstArrival != nil && record.FirstArrival.At <= r.At {
		return nil, nil
	}
	return []action.DocWrite{{Path: path, Data: map[string]interface{}{"galaxyId": gid, "systemId": sid, "bodyId": "feat-star", "firstArrival": Attribution{CorporationId: cid, At: r.At}}}}, nil
}
