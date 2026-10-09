package httpx

import (
	"errors"
	"log/slog"

	"github.com/danielgtaylor/huma/v2"

	"monoseed/internal/platform/fault"
)

func Error(err error) error {
	switch {
	case errors.Is(err, fault.ErrInvalid):
		return huma.Error422UnprocessableEntity(err.Error())
	case errors.Is(err, fault.ErrUnauthorized):
		return huma.Error401Unauthorized("Invalid credentials or expired session")
	case errors.Is(err, fault.ErrForbidden):
		return huma.Error403Forbidden("Workspace access denied")
	case errors.Is(err, fault.ErrNotFound):
		return huma.Error404NotFound("Resource not found")
	case errors.Is(err, fault.ErrConflict):
		return huma.Error409Conflict("Resource already exists")
	default:
		slog.Error("request failed", "error", err)
		return huma.Error500InternalServerError("Internal server error")
	}
}
