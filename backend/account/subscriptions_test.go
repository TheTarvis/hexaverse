package account

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"go.uber.org/mock/gomock"
)

func TestNewSubscriptionHandler(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	dao := NewMockDao(ctrl)
	h := NewSubscriptionHandler(dao)
	assert.NotNil(t, h)
}
