package deworkflow

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"
)

// Engine is a local Temporal-shaped worker. When DE_TEMPORAL_HOST is set,
// StartTrial prefers the Temporal frontend (see temporal.go + de-workflow).
type Engine struct {
	mu           sync.Mutex
	runs         map[string]*Run
	temporalHost string
}

type Run struct {
	ID         string
	WorkflowID string
	Status     string // running|succeeded|failed
	StartedAt  time.Time
	FinishedAt time.Time
	Steps      []string
	Error      string
	EngineName string
	TemporalID string
}

func New() *Engine {
	return &Engine{
		runs:         map[string]*Run{},
		temporalHost: strings.TrimSpace(os.Getenv("DE_TEMPORAL_HOST")),
	}
}

func (e *Engine) TemporalConfigured() bool {
	return e != nil && e.temporalHost != ""
}

// StartTrial prefers Temporal when configured; otherwise runs in-process.
func (e *Engine) StartTrial(ctx context.Context, runID, workflowID string) (*Run, error) {
	if e.TemporalConfigured() {
		return e.StartTrialTemporal(ctx, runID, workflowID)
	}
	return e.StartTrialLocal(ctx, runID, workflowID)
}

// StartTrialLocal executes a synchronous trial run in-process.
func (e *Engine) StartTrialLocal(ctx context.Context, runID, workflowID string) (*Run, error) {
	engineName := "de-workflow"
	temporalID := ""
	if e.TemporalConfigured() {
		engineName = "temporal"
		temporalID = fmt.Sprintf("de-wf-%s-%s", workflowID, runID)
	}
	run := &Run{
		ID: runID, WorkflowID: workflowID, Status: "running",
		StartedAt: time.Now().UTC(), Steps: []string{"validate_graph"},
		EngineName: engineName, TemporalID: temporalID,
	}
	e.mu.Lock()
	e.runs[runID] = run
	e.mu.Unlock()

	run.Steps = append(run.Steps, "allocate_worker")
	run.Steps = append(run.Steps, CallTrialActivities(ctx, workflowID)...)
	run.Steps = append(run.Steps, "collect_artifacts")
	if e.TemporalConfigured() {
		run.Steps = append(run.Steps, "temporal_schedule:"+e.temporalHost)
	}
	select {
	case <-ctx.Done():
		run.Status = "failed"
		run.Error = ctx.Err().Error()
	case <-time.After(5 * time.Millisecond):
		run.Status = "succeeded"
	}
	run.FinishedAt = time.Now().UTC()
	return run, nil
}

func (e *Engine) Get(runID string) (*Run, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	r, ok := e.runs[runID]
	if !ok {
		return nil, fmt.Errorf("run not found: %s", runID)
	}
	return r, nil
}

func (r *Run) ToMap() map[string]any {
	m := map[string]any{
		"id": r.ID, "workflowId": r.WorkflowID, "status": r.Status,
		"startedAt":  r.StartedAt.Format(time.RFC3339),
		"finishedAt": r.FinishedAt.Format(time.RFC3339),
		"engine":     r.EngineName, "steps": r.Steps, "error": r.Error,
	}
	if r.EngineName == "" {
		m["engine"] = "de-workflow"
	}
	if r.TemporalID != "" {
		m["temporalWorkflowId"] = r.TemporalID
	}
	return m
}
