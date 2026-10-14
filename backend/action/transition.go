package action

import "hexaverse/common"

// ActorTransition journals domain state in the same transaction as every
// action transition. It cannot write independently or observe a stale actor.
type ActorTransition func(previous, next map[string]interface{}, at common.WorldMillis) (map[string]interface{}, error)

func (s *Service) RegisterActorTransition(collection string, fn ActorTransition) {
	if d, ok := s.dao.(*DaoImpl); ok {
		if d.transitions == nil {
			d.transitions = map[string]ActorTransition{}
		}
		d.transitions[collection] = fn
	}
}
func (d *DaoImpl) transition(collection string, old, next map[string]interface{}, at common.WorldMillis) (map[string]interface{}, error) {
	if fn := d.transitions[collection]; fn != nil {
		return fn(old, next, at)
	}
	return next, nil
}
