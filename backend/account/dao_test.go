package account

import (
	"context"
	"hexaverse/common"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

//goland:noinspection GoUnhandledErrorResult
func TestFirestoreDaoImpl_IntegrationFlow(t *testing.T) {
	service, client := common.SetupFirestoreTestDAO(t)
	defer client.Close()
	defer common.CleanupFirestoreTestData(t, client, "accounts")
	dao := NewDaoWithClient(service)

	ctx := context.Background()

	accountIds := make(map[string]string)
	firebaseUids := make(map[string]string)
	emails := make(map[string]string)

	t.Run("Create accounts", func(t *testing.T) {
		accounts := []struct {
			name        string
			firebaseUid string
			userName    string
			email       string
		}{
			{name: "account1", firebaseUid: "firestore|test123", userName: "Test User 1", email: "test1@example.com"},
			{name: "account2", firebaseUid: "firestore|test456", userName: "Test User 2", email: "test2@example.com"},
			{name: "account3", firebaseUid: "firestore|test789", userName: "Test User 3", email: "test3@example.com"},
		}

		for _, a := range accounts {
			account := Account{
				Id:           uuid.New().String(),
				FirestoreUid: a.firebaseUid,
				Name:         a.userName,
				Email:        a.email,
			}

			err := dao.SaveAccount(ctx, account)
			require.NoError(t, err)

			accountIds[a.name] = account.Id
			firebaseUids[a.name] = account.FirestoreUid
			emails[a.name] = account.Email
		}
	})

	t.Run("Get individual accounts", func(t *testing.T) {
		account1Id := accountIds["account1"]
		retrieved, err := dao.GetByAccountId(ctx, account1Id)
		require.NoError(t, err)
		require.NotNil(t, retrieved)
		assert.Equal(t, account1Id, retrieved.Id)
		assert.Equal(t, "firestore|test123", retrieved.FirestoreUid)
		assert.Equal(t, "Test User 1", retrieved.Name)
		assert.Equal(t, "test1@example.com", retrieved.Email)

		retrieved, err = dao.GetAccountByFirestoreUid(ctx, firebaseUids["account2"])
		require.NoError(t, err)
		require.NotNil(t, retrieved)
		assert.Equal(t, accountIds["account2"], retrieved.Id)

		retrieved, err = dao.GetAccountByEmail(ctx, emails["account3"])
		require.NoError(t, err)
		require.NotNil(t, retrieved)
		assert.Equal(t, accountIds["account3"], retrieved.Id)

		retrieved, err = dao.GetByAccountId(ctx, uuid.New().String())
		require.NoError(t, err)
		assert.Nil(t, retrieved)

		retrieved, err = dao.GetAccountByFirestoreUid(ctx, "firestore|nonexistent")
		require.NoError(t, err)
		assert.Nil(t, retrieved)

		retrieved, err = dao.GetAccountByEmail(ctx, "nonexistent@example.com")
		require.NoError(t, err)
		assert.Nil(t, retrieved)
	})

	t.Run("Update accounts", func(t *testing.T) {
		account1Id := accountIds["account1"]
		newName := "Updated User 1"
		newEmail := "updated1@example.com"

		var nameInterface interface{} = newName
		var emailInterface interface{} = newEmail

		updateMap := map[string]*interface{}{
			"name":  &nameInterface,
			"email": &emailInterface,
		}

		updated, err := dao.UpdateAccount(ctx, account1Id, updateMap)
		require.NoError(t, err)
		require.NotNil(t, updated)
		assert.Equal(t, newName, updated.Name)
		assert.Equal(t, newEmail, updated.Email)

		retrieved, err := dao.GetByAccountId(ctx, account1Id)
		require.NoError(t, err)
		assert.Equal(t, newName, retrieved.Name)
		assert.Equal(t, newEmail, retrieved.Email)
		assert.Equal(t, "firestore|test123", retrieved.FirestoreUid)
	})

	t.Run("Delete accounts", func(t *testing.T) {
		for name, accountId := range accountIds {
			err := dao.DeleteAccount(ctx, accountId)
			require.NoError(t, err, "Failed to delete account %s", name)
		}

		for name, accountId := range accountIds {
			retrieved, err := dao.GetByAccountId(ctx, accountId)
			require.NoError(t, err)
			assert.Nil(t, retrieved, "Account %s should be deleted", name)
		}
	})
}
