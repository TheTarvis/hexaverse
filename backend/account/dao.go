package account

import (
	"hexaverse/common"
	"context"
	"errors"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/rs/zerolog/log"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	firestoreCollection = "accounts"
)

//go:generate mockgen -destination=dao_mock.go -package=account -source=dao.go Dao

type Dao interface {
	GetByAccountId(ctx context.Context, id string) (*Account, error)
	GetAccountByFirestoreUid(ctx context.Context, firestoreUid string) (*Account, error)
	SaveAccount(ctx context.Context, a Account) error
	UpdateAccount(ctx context.Context, accountId string, eventMap map[string]*interface{}) (*Account, error)
	DeleteAccount(ctx context.Context, id string) error
	GetAccountByEmail(ctx context.Context, email string) (*Account, error)
}

type DaoImpl struct {
	db common.FirestoreService
}

func NewDao() Dao {
	return &DaoImpl{
		db: common.NewFirestoreService(),
	}
}

func NewDaoWithClient(db common.FirestoreService) Dao {
	return &DaoImpl{
		db: db,
	}
}

// GetByAccountId retrieves an account by its ID
func (dao *DaoImpl) GetByAccountId(ctx context.Context, id string) (*Account, error) {
	doc, err := dao.db.Get(ctx, firestoreCollection, id)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			log.Warn().
				Ctx(ctx).
				Str("id", id).
				Msg("Account not found")
			return nil, nil
		}

		log.Error().
			Ctx(ctx).
			Err(err).
			Str("id", id).
			Msg("Unable to fetch account")
		return nil, err
	}

	if !doc.Exists() {
		log.Warn().
			Ctx(ctx).
			Str("id", id).
			Msg("Account document does not exist")
		return nil, nil
	}

	var account Account
	if err := doc.DataTo(&account); err != nil {
		log.Error().
			Ctx(ctx).
			Err(err).
			Str("id", id).
			Msg("Unable to unmarshal account")
		return nil, err
	}

	return &account, nil
}

// GetAccountByFirestoreUid retrieves an account by FirestoreUid
func (dao *DaoImpl) GetAccountByFirestoreUid(ctx context.Context, firestoreUid string) (*Account, error) {
	// Query by firestoreUid field (requires index)
	query := dao.db.Collection(firestoreCollection).Where("firestoreUid", "==", firestoreUid).Limit(1)

	iter := query.Documents(ctx)
	defer iter.Stop()

	doc, err := iter.Next()
	if errors.Is(err, iterator.Done) {
		log.Warn().
			Ctx(ctx).
			Str("firestoreUid", firestoreUid).
			Msg("Account not found by firestoreUid")
		return nil, nil
	}
	if err != nil {
		log.Error().
			Ctx(ctx).
			Err(err).
			Str("firestoreUid", firestoreUid).
			Msg("Unable to query account by firestoreUid")
		return nil, err
	}

	var account Account
	if err := doc.DataTo(&account); err != nil {
		log.Error().
			Ctx(ctx).
			Err(err).
			Str("firestoreUid", firestoreUid).
			Msg("Unable to unmarshal account")
		return nil, err
	}

	return &account, nil
}

// SaveAccount saves an account to Firestore
func (dao *DaoImpl) SaveAccount(ctx context.Context, a Account) error {
	err := dao.db.Set(ctx, firestoreCollection, a.Id, a)
	if err != nil {
		log.Error().
			Ctx(ctx).
			Err(err).
			Interface("account", a).
			Msg("Unable to save account")
		return err
	}

	return nil
}

// UpdateAccount updates specific fields of an account
func (dao *DaoImpl) UpdateAccount(ctx context.Context, accountId string, eventMap map[string]*interface{}) (*Account, error) {
	// Convert the eventMap to Firestore updates
	var updates []firestore.Update
	for key, value := range eventMap {
		if value != nil {
			updates = append(updates, firestore.Update{
				Path:  key,
				Value: *value,
			})
		}
	}

	// Always update the updatedAt timestamp
	updates = append(updates, firestore.Update{
		Path:  "updatedAt",
		Value: time.Now().UTC(),
	})

	// TODO TW: test this
	err := dao.db.Update(ctx, firestoreCollection, accountId, updates)
	if err != nil {
		log.Error().
			Ctx(ctx).
			Err(err).
			Str("id", accountId).
			Msg("Unable to update account")
		return nil, err
	}

	// Return the updated account
	return dao.GetByAccountId(ctx, accountId)
}

// DeleteAccount deletes an account from Firestore
func (dao *DaoImpl) DeleteAccount(ctx context.Context, id string) error {
	err := dao.db.Delete(ctx, firestoreCollection, id)
	if err != nil {
		log.Error().
			Ctx(ctx).
			Err(err).
			Str("id", id).
			Msg("Unable to delete account")
		return err
	}

	log.Debug().
		Ctx(ctx).
		Str("id", id).
		Msg("Successfully deleted account")

	return nil
}

// GetAccountByEmail retrieves an account by email
func (dao *DaoImpl) GetAccountByEmail(ctx context.Context, email string) (*Account, error) {
	// Query by email field (requires index)
	query := dao.db.Collection(firestoreCollection).Where("email", "==", email).Limit(1)

	iter := query.Documents(ctx)
	defer iter.Stop()

	doc, err := iter.Next()
	if errors.Is(err, iterator.Done) {
		log.Warn().
			Ctx(ctx).
			Str("email", email).
			Msg("Account not found by email")
		return nil, nil
	}
	if err != nil {
		log.Error().
			Ctx(ctx).
			Err(err).
			Str("email", email).
			Msg("Unable to query account by email")
		return nil, err
	}

	var account Account
	if err := doc.DataTo(&account); err != nil {
		log.Error().
			Ctx(ctx).
			Err(err).
			Str("email", email).
			Msg("Unable to unmarshal account")
		return nil, err
	}

	return &account, nil
}
