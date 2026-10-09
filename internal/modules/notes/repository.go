package notes

import (
	"context"
	"database/sql"
	"errors"

	"monoseed/internal/modules/notes/dbgen"
	"monoseed/internal/platform/fault"
)

type Note struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspace_id"`
	Title       string `json:"title"`
	Content     string `json:"content"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}
type Page struct {
	Items    []Note `json:"items" nullable:"false"`
	Total    int    `json:"total"`
	Page     int    `json:"page"`
	PageSize int    `json:"page_size"`
}
type Repository struct {
	db      *sql.DB
	queries *dbgen.Queries
}

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db, queries: dbgen.New(db)} }

// Keep the API model independent of database columns and generated persistence types.
func noteModel(n dbgen.Note) Note {
	return Note{ID: n.ID, WorkspaceID: n.WorkspaceID, Title: n.Title, Content: n.Content, CreatedAt: n.CreatedAt, UpdatedAt: n.UpdatedAt}
}
func noteError(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return fault.ErrNotFound
	}
	return err
}
func (r *Repository) Create(ctx context.Context, n Note) (Note, error) {
	row, err := r.queries.CreateNote(ctx, dbgen.CreateNoteParams{ID: n.ID, WorkspaceID: n.WorkspaceID, Title: n.Title, Content: n.Content, CreatedAt: n.CreatedAt, UpdatedAt: n.UpdatedAt})
	return noteModel(row), err
}
func (r *Repository) Get(ctx context.Context, wid, id string) (Note, error) {
	row, err := r.queries.GetNote(ctx, dbgen.GetNoteParams{WorkspaceID: wid, ID: id})
	return noteModel(row), noteError(err)
}
func (r *Repository) List(ctx context.Context, wid string, page, size int) (Page, error) {
	out := Page{Items: []Note{}, Page: page, PageSize: size}
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return out, err
	}
	defer tx.Rollback()
	queries := r.queries.WithTx(tx)
	total, err := queries.CountNotes(ctx, wid)
	if err != nil {
		return out, err
	}
	rows, err := queries.ListNotes(ctx, dbgen.ListNotesParams{WorkspaceID: wid, PageSize: int64(size), PageOffset: int64(page-1) * int64(size)})
	if err != nil {
		return out, err
	}
	out.Total = int(total)
	for _, row := range rows {
		out.Items = append(out.Items, noteModel(row))
	}
	return out, tx.Commit()
}
func (r *Repository) Update(ctx context.Context, n Note) (Note, error) {
	row, err := r.queries.UpdateNote(ctx, dbgen.UpdateNoteParams{Title: n.Title, Content: n.Content, UpdatedAt: n.UpdatedAt, WorkspaceID: n.WorkspaceID, ID: n.ID})
	return noteModel(row), noteError(err)
}
func (r *Repository) Delete(ctx context.Context, wid, id string) error {
	count, err := r.queries.DeleteNote(ctx, dbgen.DeleteNoteParams{WorkspaceID: wid, ID: id})
	if err != nil {
		return err
	}
	if count == 0 {
		return fault.ErrNotFound
	}
	return nil
}
