package workspace

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"monoseed/internal/modules/workspace/dbgen"
	"monoseed/internal/platform/fault"
	"monoseed/internal/platform/security"
)

type Workspace struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role" enum:"owner,admin,member"`
}
type Repository struct {
	db      *sql.DB
	queries *dbgen.Queries
}

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db, queries: dbgen.New(db)} }
func (r *Repository) List(ctx context.Context, uid string) ([]Workspace, error) {
	rows, err := r.queries.ListWorkspaces(ctx, uid)
	if err != nil {
		return nil, err
	}
	result := make([]Workspace, 0, len(rows))
	for _, row := range rows {
		result = append(result, Workspace{ID: row.ID, Name: row.Name, Role: row.Role})
	}
	return result, nil
}
func (r *Repository) Role(ctx context.Context, uid, wid string) (string, error) {
	role, err := r.queries.GetRole(ctx, dbgen.GetRoleParams{WorkspaceID: wid, UserID: uid})
	if errors.Is(err, sql.ErrNoRows) {
		err = fault.ErrForbidden
	}
	return role, err
}
func (r *Repository) Create(ctx context.Context, uid, name string) (Workspace, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return Workspace{}, err
	}
	defer tx.Rollback()
	queries := r.queries.WithTx(tx)
	w := Workspace{ID: security.Token(), Name: name, Role: "owner"}
	if err = queries.CreateWorkspace(ctx, dbgen.CreateWorkspaceParams{ID: w.ID, Name: name, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)}); err != nil {
		return Workspace{}, err
	}
	if err = queries.CreateOwnerMembership(ctx, dbgen.CreateOwnerMembershipParams{WorkspaceID: w.ID, UserID: uid}); err != nil {
		return Workspace{}, err
	}
	return w, tx.Commit()
}
