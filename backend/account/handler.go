package account

import (
	"net/http"
	"{{PROJECT_SLUG}}/common"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

type Handler struct {
	dao Dao
}

func NewHandler() *Handler {
	return &Handler{
		dao: NewDao(),
	}
}

// @Title Get current user's account
// @Description Get the current authenticated user's account information
// @Success 200 {object} Account "Successfully retrieved account"
// @Failure 404 {string} string "Account not found"
// @Failure 500 {string} string "Internal server error"
// @Resource accounts
// @Route /v1/accounts/firestore [get]
func (h *Handler) GetAccountSelfHandler(c *gin.Context) {
	id := common.FirestoreUid(c)
	log.Debug().Ctx(c).Msg("Getting Account with FirestoreUid")
	account, err := h.dao.GetAccountByFirestoreUid(c, id)

	if err != nil {
		log.Warn().
			Ctx(c).
			Err(err).
			Msg("Error fetching account")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	if account == nil {
		log.Warn().
			Ctx(c).
			Err(err).
			Msg("Account not found")

		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	c.IndentedJSON(http.StatusOK, account)
}

// @Title Get account by ID
// @Description Get a specific account by its ID (owner only)
// @Param accountId path string true "Account ID"
// @Success 200 {object} Account "Successfully retrieved account"
// @Failure 403 {string} string "Forbidden - can only access your own account"
// @Failure 404 {string} string "Account not found"
// @Failure 500 {string} string "Internal server error"
// @Resource accounts
// @Route /v1/accounts/{accountId} [get]
func (h *Handler) GetAccountByIdHandler(c *gin.Context) {
	id := common.AccountIdParam(c)
	authenticatedAccountId := common.Actor(c)

	// Authorization: Only allow users to access their own account
	if id != authenticatedAccountId {
		log.Warn().
			Ctx(c).
			Str("requestedAccountId", id).
			Str("authenticatedAccountId", authenticatedAccountId).
			Msg("Forbidden: User attempted to access another user's account")
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
			"error": "Forbidden: You can only access your own account details",
		})
		return
	}

	log.Debug().Ctx(c).Msg("Getting Account with AWS Account ID")
	account, err := h.dao.GetByAccountId(c, id)

	if err != nil {
		log.Warn().
			Ctx(c).
			Err(err).
			Msg("Error fetching account")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	if account == nil {
		log.Warn().
			Ctx(c).
			Err(err).
			Msg("Account not found")

		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	c.IndentedJSON(http.StatusOK, account)
}

// @Title Get account profile by ID
// @Description Get limited public profile information for an account
// @Param accountId path string true "Account ID"
// @Success 200 {object} AccountProfile "Successfully retrieved account profile"
// @Failure 404 {string} string "Account not found"
// @Failure 500 {string} string "Internal server error"
// @Resource accounts
// @Route /v1/accounts/{accountId}/profile [get]
func (h *Handler) GetAccountProfileHandler(c *gin.Context) {
	id := common.AccountIdParam(c)

	log.Debug().Ctx(c).Str("accountId", id).Msg("Getting Account Profile")
	account, err := h.dao.GetByAccountId(c, id)

	if err != nil {
		log.Warn().
			Ctx(c).
			Err(err).
			Msg("Error fetching account for profile")
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}

	if account == nil {
		log.Warn().
			Ctx(c).
			Str("accountId", id).
			Msg("Account not found for profile")

		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	// Return limited profile DTO instead of full account
	profile := account.ToProfile()
	c.IndentedJSON(http.StatusOK, profile)
}

type CreateAccountRequest struct {
	Name          string `json:"name,omitempty"`
	GivenName     string `json:"given_name,omitempty"`
	FamilyName    string `json:"family_name,omitempty"`
	Nickname      string `json:"nickname,omitempty"`
	Email         string `json:"email,omitempty"`
	EmailVerified *bool  `json:"email_verified,omitempty"`
	Picture       string `json:"picture,omitempty"`
	Profile       string `json:"profile,omitempty"`
}

// @Title Create a new account
// @Description Create a new account for the authenticated user with profile data
// @Param profileData body CreateAccountRequest false "User profile data from Firestore"
// @Success 200 {object} Account "Successfully created account"
// @Failure 400 {string} string "Bad request or account already exists"
// @Failure 500 {string} string "Internal server error"
// @Resource accounts
// @Route /v1/accounts [post]
func (h *Handler) CreateAccountHandler(c *gin.Context) {
	firestoreUid := common.FirestoreUid(c)
	log.Debug().Str("firestoreUid", firestoreUid).Msg("Creating account with firestoreUid")

	// Parse profile data from request body
	var profileData CreateAccountRequest
	if err := c.ShouldBindJSON(&profileData); err != nil {
		log.Warn().
			Ctx(c).
			Err(err).
			Msg("Invalid profile data in request")
		c.AbortWithStatusJSON(http.StatusBadRequest, "Invalid profile data")
		return
	}

	// First try to find an account with the account's firestore id
	savedAccount, err := h.dao.GetAccountByFirestoreUid(c, firestoreUid)
	if err != nil {
		log.Error().
			Ctx(c).
			Err(err).
			Type("account", savedAccount).
			Msg("Error checking for existing account")
		c.AbortWithStatusJSON(http.StatusInternalServerError, "Error Creating Account")
		return
	}

	if savedAccount != nil {
		log.Warn().
			Ctx(c).
			Type("account", savedAccount).
			Msg("Account already created")
		c.AbortWithStatusJSON(http.StatusBadRequest, "Account already created.")
		return
	}

	// If not found we can create the account
	id := uuid.New().String()
	account := NewAccount(id)
	account.FirestoreUid = firestoreUid

	// Set admin status from JWT claims
	account.IsAdmin = common.IsAdmin(c)

	// Set profile data from request
	account.Name = profileData.Name
	account.GivenName = profileData.GivenName
	account.FamilyName = profileData.FamilyName
	account.Nickname = profileData.Nickname
	account.Email = profileData.Email
	account.EmailVerified = profileData.EmailVerified
	account.Picture = profileData.Picture
	account.Profile = profileData.Profile

	err = h.dao.SaveAccount(c, account)
	if err != nil {
		log.Error().
			Ctx(c).
			Err(err).
			Type("account", account).
			Msg("Unable to save account")

		c.AbortWithStatusJSON(http.StatusInternalServerError, "Unable to create account")
		return
	}

	c.IndentedJSON(http.StatusOK, account)
}

// RegisterRoutes registers all account-related routes.
// strictLimit is applied to endpoints that are credential or enumeration surfaces
// for CASA Tier 3 / OWASP ASVS V2.2.1 anti-automation compliance:
//   - POST /accounts            — account creation spam
//   - GET  /accounts/firestore  — first touch point after Firebase login
//   - GET  /accounts/:id/profile — user profile enumeration
func (h *Handler) RegisterRoutes(authorized *gin.RouterGroup, strictLimit gin.HandlerFunc) {
	accounts := authorized.Group("/accounts")
	{
		accounts.GET("/firestore", strictLimit, h.GetAccountSelfHandler)
		accounts.GET("/:accountId", h.GetAccountByIdHandler)
		accounts.GET("/:accountId/profile", strictLimit, h.GetAccountProfileHandler)
		accounts.POST("", strictLimit, h.CreateAccountHandler)
	}
}
