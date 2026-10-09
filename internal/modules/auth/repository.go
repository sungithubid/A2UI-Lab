package auth

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"monoseed/internal/modules/auth/dbgen"
	"monoseed/internal/platform/fault"
	"monoseed/internal/platform/security"
)

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}
type Session struct {
	User      User
	CSRF      string
	ExpiresAt time.Time
	TokenHash string
}
type Repository struct {
	db      *sql.DB
	queries *dbgen.Queries
}

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db, queries: dbgen.New(db)} }
func (r *Repository) Credentials(ctx context.Context, email string) (User, string, error) {
	row, err := r.queries.GetCredentials(ctx, email)
	if errors.Is(err, sql.ErrNoRows) {
		err = fault.ErrUnauthorized
	}
	return User{ID: row.ID, Email: row.Email}, row.PasswordHash, err
}

// CreateAdmin commits identity, workspace and owner membership atomically.
func (r *Repository) CreateAdmin(ctx context.Context, email, hash, name string) (User, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback()
	queries := r.queries.WithTx(tx)
	u := User{ID: security.Token(), Email: email}
	wid := security.Token()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	count, err := queries.CreateAdminUser(ctx, dbgen.CreateAdminUserParams{ID: u.ID, Email: email, PasswordHash: hash, CreatedAt: now})
	if err != nil {
		return User{}, err
	}
	if count == 0 {
		return User{}, fault.ErrConflict
	}
	if err = queries.CreateAdminWorkspace(ctx, dbgen.CreateAdminWorkspaceParams{ID: wid, Name: name, CreatedAt: now}); err != nil {
		return User{}, err
	}
	if err = queries.CreateAdminMembership(ctx, dbgen.CreateAdminMembershipParams{WorkspaceID: wid, UserID: u.ID}); err != nil {
		return User{}, err
	}
	return u, tx.Commit()
}
func (r *Repository) SaveSession(ctx context.Context, s Session) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	queries := r.queries.WithTx(tx)
	if err = queries.DeleteExpiredSessions(ctx, time.Now().Unix()); err != nil {
		return err
	}
	// Bound persistent sessions per account: retain nine previous sessions before insertion.
	if err = queries.TrimUserSessions(ctx, s.User.ID); err != nil {
		return err
	}
	if err = queries.SaveSession(ctx, dbgen.SaveSessionParams{TokenHash: s.TokenHash, UserID: s.User.ID, CSRFToken: s.CSRF, ExpiresAt: s.ExpiresAt.Unix()}); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) Session(ctx context.Context, hash string) (Session, error) {
	row, err := r.queries.GetSession(ctx, dbgen.GetSessionParams{TokenHash: hash, ExpiresAt: time.Now().Unix()})
	if errors.Is(err, sql.ErrNoRows) {
		err = fault.ErrUnauthorized
	}
	return Session{User: User{ID: row.ID, Email: row.Email}, CSRF: row.CSRFToken, TokenHash: hash, ExpiresAt: time.Unix(row.ExpiresAt, 0)}, err
}
func (r *Repository) DeleteSession(ctx context.Context, hash string) error {
	return r.queries.DeleteSession(ctx, hash)
}
