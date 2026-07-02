package account

import "time"

type Account struct {
	Id           string `json:"id" firestore:"id"`
	FirestoreUid string `json:"-" firestore:"firestoreUid"`
	IsAdmin      bool   `json:"is_admin" firestore:"isAdmin"`

	Name          string `json:"name,omitempty" firestore:"name,omitempty"`
	GivenName     string `json:"given_name,omitempty" firestore:"givenName,omitempty"`
	FamilyName    string `json:"family_name,omitempty" firestore:"familyName,omitempty"`
	Nickname      string `json:"nickname,omitempty" firestore:"nickname,omitempty"`
	Email         string `json:"email,omitempty" firestore:"email,omitempty"`
	EmailVerified *bool  `json:"email_verified,omitempty" firestore:"emailVerified,omitempty"`
	Picture       string `json:"picture,omitempty" firestore:"picture,omitempty"`
	Profile       string `json:"profile,omitempty" firestore:"profile,omitempty"`

	CreatedAt time.Time  `json:"createdAt" firestore:"createdAt"`
	UpdatedAt *time.Time `json:"updatedAt,omitempty" firestore:"updatedAt,omitempty"`
}

func NewAccount(id string) Account {
	return Account{
		Id:        id,
		CreatedAt: time.Now().UTC(),
	}
}

// AccountProfile is the limited DTO for public profile info shown to other users.
type AccountProfile struct {
	Id      string `json:"id"`
	Name    string `json:"name,omitempty"`
	Email   string `json:"email,omitempty"`
	Picture string `json:"picture,omitempty"`
}

func (a *Account) ToProfile() AccountProfile {
	return AccountProfile{
		Id:      a.Id,
		Name:    a.Name,
		Email:   a.Email,
		Picture: a.Picture,
	}
}
