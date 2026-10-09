package auth

import (
	"context"
	"fmt"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"

	"monoseed/internal/platform/fault"
	"monoseed/internal/platform/security"
)

type Store interface {
	Credentials(context.Context, string) (User, string, error)
	CreateAdmin(context.Context, string, string, string) (User, error)
	SaveSession(context.Context, Session) error
	Session(context.Context, string) (Session, error)
	DeleteSession(context.Context, string) error
}
type Service struct {
	repo      Store
	ttl       time.Duration
	dummyHash []byte
}

func NewService(repo Store, ttl time.Duration) *Service {
	dummy, err := bcrypt.GenerateFromPassword([]byte(security.Token()), bcrypt.DefaultCost)
	if err != nil {
		panic(err)
	}
	return &Service{repo: repo, ttl: ttl, dummyHash: dummy}
}

func (s *Service) CreateAdmin(ctx context.Context, email, password, name string) (User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	name = strings.TrimSpace(name)
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || len(email) > 254 {
		return User{}, fmt.Errorf("%w: valid email required", fault.ErrInvalid)
	}
	if len(password) < 12 || len(password) > 72 {
		return User{}, fmt.Errorf("%w: password must be 12–72 bytes", fault.ErrInvalid)
	}
	if utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 100 {
		return User{}, fmt.Errorf("%w: workspace name must be 1–100 characters", fault.ErrInvalid)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, err
	}
	return s.repo.CreateAdmin(ctx, email, string(hash), name)
}

func (s *Service) Login(ctx context.Context, email, password string) (Session, string, error) {
	u, hash, err := s.repo.Credentials(ctx, strings.ToLower(strings.TrimSpace(email)))
	if err != nil {
		bcrypt.CompareHashAndPassword(s.dummyHash, []byte(password))
		return Session{}, "", err
	}
	if len(password) > 72 || bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return Session{}, "", fault.ErrUnauthorized
	}
	token := security.Token()
	session := Session{User: u, CSRF: security.Token(), TokenHash: security.Hash(token), ExpiresAt: time.Now().Add(s.ttl)}
	if err = s.repo.SaveSession(ctx, session); err != nil {
		return Session{}, "", err
	}
	return session, token, nil
}

func (s *Service) Authenticate(ctx context.Context, token string) (Session, error) {
	if len(token) != 43 {
		return Session{}, fault.ErrUnauthorized
	}
	return s.repo.Session(ctx, security.Hash(token))
}

func (s *Service) Logout(ctx context.Context, session Session) error {
	return s.repo.DeleteSession(ctx, session.TokenHash)
}
