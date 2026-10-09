package workspace

import (
	"context"

	"github.com/danielgtaylor/huma/v2"

	"monoseed/internal/modules/auth"
	"monoseed/internal/platform/httpx"
)

type ListOutput struct {
	Body struct {
		Items []Workspace `json:"items" nullable:"false"`
	}
}
type CreateInput struct {
	Body struct {
		Name string `json:"name" minLength:"1" maxLength:"100"`
	}
}
type CreateOutput struct{ Body Workspace }

func Register(api huma.API, s *Service) {
	huma.Register(api, huma.Operation{OperationID: "list-workspaces", Method: "GET", Path: "/api/workspaces", Summary: "Your workspaces"}, func(ctx context.Context, _ *struct{}) (*ListOutput, error) {
		items, err := s.List(ctx, auth.Current(ctx).User.ID)
		if err != nil {
			return nil, httpx.Error(err)
		}
		out := &ListOutput{}
		out.Body.Items = items
		return out, nil
	})
	huma.Register(api, huma.Operation{OperationID: "create-workspace", Method: "POST", Path: "/api/workspaces", DefaultStatus: 201, Summary: "Create workspace", MaxBodyBytes: 4096}, func(ctx context.Context, in *CreateInput) (*CreateOutput, error) {
		w, err := s.Create(ctx, auth.Current(ctx).User.ID, in.Body.Name)
		if err != nil {
			return nil, httpx.Error(err)
		}
		return &CreateOutput{Body: w}, nil
	})
}
