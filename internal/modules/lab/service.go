package lab

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"reflect"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/sungithubid/A2UI-Lab/internal/a2ui"
	"github.com/sungithubid/A2UI-Lab/internal/action"
	"github.com/sungithubid/A2UI-Lab/internal/agent"
	"github.com/sungithubid/A2UI-Lab/internal/event"
	"github.com/sungithubid/A2UI-Lab/internal/platform/fault"
	"github.com/sungithubid/A2UI-Lab/internal/presentation"
)

type Scenario struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

func Scenarios() []Scenario {
	return []Scenario{
		{"server-health", "Server health", "Text, tool call, progress, result, bound card and a View errors action."},
		{"streaming-text", "Streaming text", "Deterministic incremental text without external services."},
		{"tool-error", "Tool error", "An explicit tool failure that remains inspectable and replayable."},
		{"image-card", "Image card · resource discovery", "An illustrated recommendation linking to official documentation."},
		{"image-list", "Image list · search results", "Three streaming results with a thumbnail on the left and text on the right."},
		{"support-form", "Form · support ticket", "Collect details, validate input and persist a local demo ticket."},
		{"deployment-approval", "Confirmation · staging deployment", "Pause for human approval or rejection before a simulated deployment."},
	}
}

type Create struct {
	ConversationID string `json:"conversationId,omitempty" maxLength:"100"`
	ParentRunID    string `json:"parentRunId,omitempty" maxLength:"100"`
	Prompt         string `json:"prompt" minLength:"1" maxLength:"2000"`
	ScenarioID     string `json:"scenarioId" enum:"server-health,streaming-text,tool-error,image-card,image-list,support-form,deployment-approval"`
}
type worker struct {
	cancel context.CancelFunc
	done   chan struct{}
}

type Service struct {
	workers map[string]*worker
	repo    *Repository
	agent   agent.Agent
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	mu      sync.Mutex
	closed  bool
	active  int
	log     *slog.Logger
}

func NewService(repo *Repository, a agent.Agent, log *slog.Logger) *Service {
	ctx, cancel := context.WithCancel(context.Background())
	return &Service{repo: repo, agent: a, ctx: ctx, cancel: cancel, log: log, workers: map[string]*worker{}}
}
func (s *Service) Close() { s.mu.Lock(); s.closed = true; s.cancel(); s.mu.Unlock(); s.wg.Wait() }
func (s *Service) Create(ctx context.Context, in Create) (Run, error) {
	in.Prompt = strings.TrimSpace(in.Prompt)
	valid := false
	for _, v := range Scenarios() {
		if in.ScenarioID == v.ID {
			valid = true
		}
	}
	if !valid || in.Prompt == "" || len(in.Prompt) > 2000 || len(in.ConversationID) > 100 || len(in.ParentRunID) > 100 {
		return Run{}, fmt.Errorf("%w: prompt and known scenario required", fault.ErrInvalid)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed || s.active >= 8 {
		return Run{}, fmt.Errorf("%w: runtime unavailable or busy", fault.ErrConflict)
	}
	contextStart := time.Now()
	history := []Run{}
	turn := int64(1)
	if in.ConversationID != "" {
		var err error
		history, err = s.repo.Conversation(ctx, in.ConversationID)
		if err != nil {
			return Run{}, err
		}
		latest := history[len(history)-1]
		if latest.ID != in.ParentRunID || latest.Status == "running" || latest.Status == "waiting_input" {
			return Run{}, fmt.Errorf("%w: continue from the latest finished turn; resolve pending input first", fault.ErrConflict)
		}
		if latest.TurnIndex >= 100 {
			return Run{}, fmt.Errorf("%w: conversation limit is 100 turns; start a new conversation", fault.ErrConflict)
		}
		turn = latest.TurnIndex + 1
	} else if in.ParentRunID != "" {
		return Run{}, fmt.Errorf("%w: conversationId required with parentRunId", fault.ErrInvalid)
	}
	req, contextInfo, err := s.buildRequest(ctx, in, history)
	if err != nil {
		return Run{}, err
	}
	contextDuration := time.Since(contextStart).Milliseconds()
	r, err := s.repo.CreateTurn(ctx, in.Prompt, in.ScenarioID, string(a2ui.Version), in.ConversationID, turn)
	if err != nil {
		return r, err
	}
	err = s.repo.Append(ctx, r.ID, []event.Message{event.New("run.started", map[string]any{"scenarioId": in.ScenarioID, "rendering": "hybrid", "conversationId": r.ConversationID, "turnIndex": r.TurnIndex}), event.New("user.message", map[string]any{"text": in.Prompt}), event.New("trace.context", map[string]any{"context": contextInfo, "durationMs": contextDuration})}, "")
	if err != nil {
		return r, err
	}
	s.wg.Add(1)
	s.active++
	workerCtx, cancel := context.WithCancel(s.ctx)
	w := &worker{cancel: cancel, done: make(chan struct{})}
	s.workers[r.ID] = w
	go func() {
		defer s.wg.Done()
		defer func() {
			cancel()
			// Signal after the final event write, before taking mu: bulk deletion holds
			// mu while waiting so creates/actions cannot race with the purge.
			close(w.done)
			s.mu.Lock()
			delete(s.workers, r.ID)
			s.active--
			s.mu.Unlock()
		}()
		s.execute(workerCtx, r, req)
	}()
	return s.repo.Get(ctx, r.ID)
}
func protocolMessage(m a2ui.Message) event.Message {
	if err := a2ui.Validate(m); err != nil {
		return event.New("validation.error", map[string]any{"message": err.Error(), "incoming": m})
	}
	return event.New("a2ui.message", m)
}
func (s *Service) execute(parent context.Context, r Run, req agent.Request) {
	ctx, cancel := context.WithTimeout(parent, 20*time.Second)
	defer cancel()
	status := "completed"
	startedAt := time.Now()
	var semantic presentation.Presenter
	var protocol a2ui.Presenter
	surfaceStarted := false
	outputChars := 0
	pending, pendingID := "", ""
	firstText := true
	appendMessage := func(writeCtx context.Context, m event.Message) error {
		batch := []event.Message{m}
		for _, view := range semantic.Present(m) {
			batch = append(batch, event.New("presentation.event", view))
			if view.Kind == "text-delta" {
				continue
			}
			if !surfaceStarted {
				batch = append(batch, protocolMessage(protocol.Start()))
				surfaceStarted = true
			}
			for _, msg := range protocol.Render(view) {
				batch = append(batch, protocolMessage(msg))
			}
		}
		return s.repo.Append(writeCtx, r.ID, batch, "")
	}
	flush := func(writeCtx context.Context) error {
		if pending == "" {
			return nil
		}
		text := pending
		pending = ""
		return appendMessage(writeCtx, event.New("model.text_delta", event.TextDelta{MessageID: pendingID, Text: text}))
	}
	defer func() {
		if ctx.Err() != nil {
			status = "interrupted"
		}
		finalCtx, c := context.WithTimeout(context.Background(), 3*time.Second)
		defer c()
		if err := flush(finalCtx); err != nil {
			status = "failed"
			s.log.Error("flush text", "error", err)
		}
		finish := []event.Message{event.New("model.response", map[string]any{"adapter": "mock", "externalCall": false, "status": status, "outputCharacters": outputChars, "durationMs": time.Since(startedAt).Milliseconds()}), event.New("run."+status, map[string]any{})}
		if err := s.repo.Append(finalCtx, r.ID, finish, status); err != nil {
			s.log.Error("finish run", "run_id", r.ID, "error", err)
		}
	}()
	if err := s.repo.Append(ctx, r.ID, []event.Message{event.New("model.request", map[string]any{"adapter": "mock", "externalCall": false, "request": req, "textBuffer": map[string]any{"maxWaitMs": 50, "maxCharacters": 128, "firstChunkImmediate": true}})}, ""); err != nil {
		status = "failed"
		return
	}
	stream, err := s.agent.Run(ctx, req)
	if err != nil {
		status = "failed"
		if e := appendMessage(ctx, event.New("error.occurred", event.ErrorOccurred{Code: "agent_start", Message: err.Error()})); e != nil {
			s.log.Error("persist agent error", "error", e)
		}
		return
	}
	tick := time.NewTicker(50 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			if err = flush(ctx); err != nil {
				status = "failed"
				return
			}
		case m, ok := <-stream:
			if !ok {
				return
			}
			if m.Kind == "model.text_delta" {
				id, _ := m.Payload["messageId"].(string)
				text, _ := m.Payload["text"].(string)
				if pendingID != id {
					if err = flush(ctx); err != nil {
						status = "failed"
						return
					}
				}
				pendingID = id
				pending += text
				outputChars += utf8.RuneCountInString(text)
				if firstText || utf8.RuneCountInString(pending) >= 128 {
					firstText = false
					if err = flush(ctx); err != nil {
						status = "failed"
						return
					}
				}
				continue
			}
			if err = flush(ctx); err != nil {
				status = "failed"
				return
			}
			if m.Kind == "input.required" || m.Kind == "approval.required" {
				status = "waiting_input"
			}
			if m.Kind == "error.occurred" {
				status = "failed"
			}
			if err = appendMessage(ctx, m); err != nil {
				s.log.Error("persist event", "error", err)
				status = "failed"
				return
			}
		}
	}
}
func (s *Service) Conversation(ctx context.Context, id string) ([]Run, error) {
	run, err := s.repo.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	return s.repo.Conversation(ctx, run.ConversationID)
}
func (s *Service) Get(ctx context.Context, id string) (Run, error) { return s.repo.Get(ctx, id) }
func (s *Service) List(ctx context.Context, offset int) ([]Run, error) {
	if offset < 0 {
		return nil, fault.ErrInvalid
	}
	return s.repo.List(ctx, offset)
}
func (s *Service) Events(ctx context.Context, id string, after int64) ([]event.Event, error) {
	if after < 0 {
		return nil, fault.ErrInvalid
	}
	return s.repo.Events(ctx, id, after)
}
func (s *Service) Delete(ctx context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.repo.Delete(ctx, id)
}
func (s *Service) Action(ctx context.Context, id string, a action.Envelope) (Run, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, err := s.repo.Get(ctx, id)
	if err != nil {
		return r, err
	}
	history, err := s.repo.Conversation(ctx, r.ConversationID)
	if err != nil {
		return r, err
	}
	if history[len(history)-1].ID != id {
		return r, fmt.Errorf("%w: actions on earlier turns are read-only", fault.ErrConflict)
	}
	result, err := action.Route(a, id, r.ScenarioID)
	if err != nil {
		return r, err
	}
	events, err := s.repo.Events(ctx, id, 0)
	if err != nil {
		return r, err
	}
	for _, e := range events {
		if e.Kind == "action.received" {
			var previous action.Envelope
			data, err := json.Marshal(e.Payload)
			if err != nil {
				return r, err
			}
			if err = json.Unmarshal(data, &previous); err != nil {
				return r, err
			}
			if reflect.DeepEqual(previous, a) {
				return r, nil
			}
			return r, fmt.Errorf("%w: this interaction has already been resolved", fault.ErrConflict)
		}
	}
	requiredStatus := "waiting_input"
	if r.ScenarioID == "server-health" {
		requiredStatus = "completed"
	}
	if r.Status != requiredStatus {
		return r, fmt.Errorf("%w: run is not ready for this action", fault.ErrConflict)
	}
	batch := []event.Message{event.New("action.received", a)}
	batch = append(batch, result.Events...)
	semantic := &presentation.Presenter{}
	for _, m := range result.Events {
		for _, view := range semantic.Present(m) {
			batch = append(batch, event.New("presentation.event", view))
			for _, msg := range a2ui.ActionResult(view) {
				batch = append(batch, protocolMessage(msg))
			}
		}
	}
	if result.Status != "" {
		batch = append(batch, event.New("run."+result.Status, map[string]any{}))
	}
	if err = s.repo.Append(ctx, id, batch, result.Status); err != nil {
		return r, err
	}
	return s.repo.Get(ctx, id)
}

type DeleteAllResult struct {
	Deleted int64 `json:"deleted"`
}

func (s *Service) DeleteAll(ctx context.Context, confirmed bool) (DeleteAllResult, error) {
	if !confirmed {
		return DeleteAllResult{}, fmt.Errorf("%w: explicit confirmation is required", fault.ErrInvalid)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return DeleteAllResult{}, err
	}
	for _, w := range s.workers {
		w.cancel()
	}
	for _, w := range s.workers {
		select {
		case <-w.done:
		case <-ctx.Done():
			return DeleteAllResult{}, ctx.Err()
		}
	}
	deleted, err := s.repo.DeleteAll(ctx)
	return DeleteAllResult{Deleted: deleted}, err
}
