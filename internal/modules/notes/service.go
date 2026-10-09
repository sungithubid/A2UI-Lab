package notes

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"monoseed/internal/platform/fault"
	"monoseed/internal/platform/security"
)

type Store interface {
	Create(context.Context, Note) (Note, error)
	Get(context.Context, string, string) (Note, error)
	List(context.Context, string, int, int) (Page, error)
	Update(context.Context, Note) (Note, error)
	Delete(context.Context, string, string) error
}
type Membership interface {
	RequireMember(context.Context, string, string) error
}
type Service struct {
	repo    Store
	members Membership
}

func NewService(repo Store, members Membership) *Service {
	return &Service{repo: repo, members: members}
}

type Write struct {
	Title   string `json:"title" minLength:"1" maxLength:"200"`
	Content string `json:"content" maxLength:"20000"`
}

func validate(in Write) (Write, error) {
	in.Title = strings.TrimSpace(in.Title)
	if utf8.RuneCountInString(in.Title) < 1 || utf8.RuneCountInString(in.Title) > 200 || utf8.RuneCountInString(in.Content) > 20000 {
		return in, fmt.Errorf("%w: title must be 1–200 characters and content at most 20000", fault.ErrInvalid)
	}
	return in, nil
}

func (s *Service) Create(ctx context.Context, uid, wid string, in Write) (Note, error) {
	if err := s.members.RequireMember(ctx, uid, wid); err != nil {
		return Note{}, err
	}
	in, err := validate(in)
	if err != nil {
		return Note{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	return s.repo.Create(ctx, Note{ID: security.Token(), WorkspaceID: wid, Title: in.Title, Content: in.Content, CreatedAt: now, UpdatedAt: now})
}

func (s *Service) Get(ctx context.Context, uid, wid, id string) (Note, error) {
	if err := s.members.RequireMember(ctx, uid, wid); err != nil {
		return Note{}, err
	}
	return s.repo.Get(ctx, wid, id)
}

func (s *Service) List(ctx context.Context, uid, wid string, page, size int) (Page, error) {
	if err := s.members.RequireMember(ctx, uid, wid); err != nil {
		return Page{}, err
	}
	if page < 1 || page > 1000000 || size < 1 || size > 100 {
		return Page{}, fault.ErrInvalid
	}
	return s.repo.List(ctx, wid, page, size)
}

func (s *Service) Update(ctx context.Context, uid, wid, id string, in Write) (Note, error) {
	if err := s.members.RequireMember(ctx, uid, wid); err != nil {
		return Note{}, err
	}
	in, err := validate(in)
	if err != nil {
		return Note{}, err
	}
	return s.repo.Update(ctx, Note{ID: id, WorkspaceID: wid, Title: in.Title, Content: in.Content, UpdatedAt: time.Now().UTC().Format(time.RFC3339Nano)})
}

func (s *Service) Delete(ctx context.Context, uid, wid, id string) error {
	if err := s.members.RequireMember(ctx, uid, wid); err != nil {
		return err
	}
	return s.repo.Delete(ctx, wid, id)
}
