package notes

import (
	"context"

	"github.com/danielgtaylor/huma/v2"

	"monoseed/internal/modules/auth"
	"monoseed/internal/platform/httpx"
)

type WorkspaceInput struct {
	WorkspaceID string `path:"workspaceID"`
}
type ItemInput struct {
	WorkspaceInput
	ID string `path:"id"`
}
type ListInput struct {
	WorkspaceInput
	Page     int `query:"page" default:"1" minimum:"1" maximum:"1000000"`
	PageSize int `query:"page_size" default:"20" minimum:"1" maximum:"100"`
}
type CreateInput struct {
	WorkspaceInput
	Body Write
}
type UpdateInput struct {
	ItemInput
	Body Write
}
type Output struct{ Body Note }
type ListOutput struct{ Body Page }

func Register(api huma.API, s *Service) {
	const base = "/api/workspaces/{workspaceID}/notes"
	huma.Register(api, huma.Operation{OperationID: "list-notes", Method: "GET", Path: base, Summary: "List workspace notes"}, func(ctx context.Context, in *ListInput) (*ListOutput, error) {
		p, err := s.List(ctx, auth.Current(ctx).User.ID, in.WorkspaceID, in.Page, in.PageSize)
		if err != nil {
			return nil, httpx.Error(err)
		}
		return &ListOutput{Body: p}, nil
	})
	huma.Register(api, huma.Operation{OperationID: "get-note", Method: "GET", Path: base + "/{id}", Summary: "Read note"}, func(ctx context.Context, in *ItemInput) (*Output, error) {
		n, err := s.Get(ctx, auth.Current(ctx).User.ID, in.WorkspaceID, in.ID)
		if err != nil {
			return nil, httpx.Error(err)
		}
		return &Output{Body: n}, nil
	})
	huma.Register(api, huma.Operation{OperationID: "create-note", Method: "POST", Path: base, DefaultStatus: 201, Summary: "Create note", MaxBodyBytes: 128 * 1024}, func(ctx context.Context, in *CreateInput) (*Output, error) {
		n, err := s.Create(ctx, auth.Current(ctx).User.ID, in.WorkspaceID, in.Body)
		if err != nil {
			return nil, httpx.Error(err)
		}
		return &Output{Body: n}, nil
	})
	huma.Register(api, huma.Operation{OperationID: "update-note", Method: "PUT", Path: base + "/{id}", Summary: "Update note", MaxBodyBytes: 128 * 1024}, func(ctx context.Context, in *UpdateInput) (*Output, error) {
		n, err := s.Update(ctx, auth.Current(ctx).User.ID, in.WorkspaceID, in.ID, in.Body)
		if err != nil {
			return nil, httpx.Error(err)
		}
		return &Output{Body: n}, nil
	})
	huma.Register(api, huma.Operation{OperationID: "delete-note", Method: "DELETE", Path: base + "/{id}", Summary: "Delete note", DefaultStatus: 204}, func(ctx context.Context, in *ItemInput) (*struct{}, error) {
		if err := s.Delete(ctx, auth.Current(ctx).User.ID, in.WorkspaceID, in.ID); err != nil {
			return nil, httpx.Error(err)
		}
		return nil, nil
	})
}
