package workspace

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	"monoseed/internal/platform/fault"
)

type Service struct{ repo *Repository }

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

func (s *Service) List(ctx context.Context, uid string) ([]Workspace, error) {
	return s.repo.List(ctx, uid)
}

func (s *Service) RequireMember(ctx context.Context, uid, wid string) error {
	_, err := s.repo.Role(ctx, uid, wid)
	return err
}

func (s *Service) Create(ctx context.Context, uid, name string) (Workspace, error) {
	name = strings.TrimSpace(name)
	if utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 100 {
		return Workspace{}, fmt.Errorf("%w: workspace name must be 1–100 characters", fault.ErrInvalid)
	}
	return s.repo.Create(ctx, uid, name)
}
