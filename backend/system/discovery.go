package system

import (
	"context"

	"hexaverse/discovery"
	"hexaverse/galaxy"
)

type DiscoverySource interface {
	Records(context.Context, string) ([]discovery.Record, error)
}

func (s *Service) WithDiscovery(d DiscoverySource) *Service { s.discovery = d; return s }
func (s *Service) projectDiscovery(ctx context.Context, gid string, gen *GeneratedInterior) error {
	if s.discovery == nil {
		return nil
	}
	records, err := s.discovery.Records(ctx, gid)
	if err != nil {
		return err
	}
	byID := map[string]discovery.Record{}
	for _, r := range records {
		if r.SystemId == gen.Interior.SystemId {
			byID[r.BodyId] = r
		}
	}
	for i := range gen.Features {
		f := &gen.Features[i]
		if f.CatalogueRef == "" {
			f.CatalogueRef = galaxy.CatalogueReference(gid, gen.Interior.SystemId) + " " + f.Id
		}
		if r, ok := byID[f.Id]; ok {
			f.Discovery = &r
			f.OwnerCorpId = r.OwnerCorpId
			if r.Name != "" {
				f.Name = r.Name
			}
		}
	}
	return nil
}
func (s *Service) DiscoveryTargets(ctx context.Context, sid string) ([]discovery.Target, error) {
	gen, err := s.GetOrCreateInterior(ctx, sid)
	if err != nil {
		return nil, err
	}
	meta, err := s.galaxySvc.LiveGalaxyMeta(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]discovery.Target, 0, len(gen.Features))
	for _, f := range gen.Features {
		out = append(out, discovery.Target{GalaxyId: meta.Id, SystemId: sid, BodyId: f.Id, Kind: string(f.Type), Name: f.Name, GeneratedName: f.GeneratedName, CatalogueRef: f.CatalogueRef, Protected: f.NamingProtected})
	}
	return out, nil
}
