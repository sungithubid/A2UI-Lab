package notes

import (
	"context"
	"errors"
	"strings"
	"testing"

	"monoseed/internal/platform/fault"
)

type fakeMembers struct{ err error }

func (m fakeMembers) RequireMember(context.Context, string, string) error { return m.err }

type fakeStore struct {
	calls int
	note  Note
}

func (r *fakeStore) Create(_ context.Context, n Note) (Note, error) {
	r.calls++
	r.note = n
	return n, nil
}

func (r *fakeStore) Get(context.Context, string, string) (Note, error) { r.calls++; return r.note, nil }

func (r *fakeStore) List(context.Context, string, int, int) (Page, error) {
	r.calls++
	return Page{}, nil
}

func (r *fakeStore) Update(_ context.Context, n Note) (Note, error) { r.calls++; return n, nil }

func (r *fakeStore) Delete(context.Context, string, string) error { r.calls++; return nil }

func TestServiceRequiresMembershipBeforeEveryOperation(t *testing.T) {
	ctx := context.Background()
	repo := &fakeStore{}
	s := NewService(repo, fakeMembers{err: fault.ErrForbidden})
	_, a := s.Create(ctx, "u", "w", Write{Title: "Title"})
	_, b := s.Get(ctx, "u", "w", "n")
	_, c := s.List(ctx, "u", "w", 1, 20)
	_, d := s.Update(ctx, "u", "w", "n", Write{Title: "Title"})
	e := s.Delete(ctx, "u", "w", "n")
	for _, err := range []error{a, b, c, d, e} {
		if !errors.Is(err, fault.ErrForbidden) {
			t.Fatalf("unexpected error: %v", err)
		}
	}
	if repo.calls != 0 {
		t.Fatal("unauthorized request touched repository")
	}
}

func TestValidationAndNormalization(t *testing.T) {
	repo := &fakeStore{}
	s := NewService(repo, fakeMembers{})
	ctx := context.Background()
	for _, in := range []Write{{Title: "   "}, {Title: strings.Repeat("a", 201)}, {Title: "Title", Content: strings.Repeat("a", 20001)}} {
		if _, err := s.Create(ctx, "u", "w", in); !errors.Is(err, fault.ErrInvalid) {
			t.Fatalf("input accepted: %v", err)
		}
	}
	n, err := s.Create(ctx, "u", "w", Write{Title: "  Useful idea  ", Content: "body"})
	if err != nil {
		t.Fatal(err)
	}
	if n.Title != "Useful idea" || n.WorkspaceID != "w" || n.ID == "" || n.CreatedAt == "" {
		t.Fatalf("bad note: %+v", n)
	}
	if _, err = s.List(ctx, "u", "w", 0, 20); !errors.Is(err, fault.ErrInvalid) {
		t.Fatal("invalid page accepted")
	}
	if _, err = s.List(ctx, "u", "w", 1, 101); !errors.Is(err, fault.ErrInvalid) {
		t.Fatal("invalid size accepted")
	}
}
