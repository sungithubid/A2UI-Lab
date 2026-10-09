package fault

import "errors"

// Domain errors carry no transport status and can be used by CLI/services.
var (
	ErrInvalid      = errors.New("invalid input")
	ErrUnauthorized = errors.New("invalid credentials or expired session")
	ErrForbidden    = errors.New("workspace access denied")
	ErrNotFound     = errors.New("resource not found")
	ErrConflict     = errors.New("resource already exists")
)
