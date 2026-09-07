// Package pmsop is a small project-management SOP engine. A Template
// lists ordered Stages, each Stage lists Tasks. Rendering a Template
// produces a Plan (a workspace-scoped, addressable copy of the
// template). Events (task.start / task.complete / task.block /
// task.unblock / task.note) advance the Plan through its state
// machine. When all tasks in a Stage are done the Stage auto-advances
// to "completed"; when every Stage is completed the Plan becomes
// "completed".
//
// The package is intentionally pure — no network, no DB. Persistence
// happens in internal/server/handlers_pmsop.go, which keeps the Plan
// JSON in Store.KnowledgeExtra["pmsop_plans"].
package pmsop

import (
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"
)

// TaskStatus / StageStatus / PlanStatus are the state-machine verbs.
type TaskStatus string

const (
	TaskPending    TaskStatus = "pending"
	TaskInProgress TaskStatus = "in_progress"
	TaskDone       TaskStatus = "done"
	TaskBlocked    TaskStatus = "blocked"
)

type StageStatus string

const (
	StagePending   StageStatus = "pending"
	StageActive    StageStatus = "active"
	StageCompleted StageStatus = "completed"
)

type PlanStatus string

const (
	PlanDraft     PlanStatus = "draft"
	PlanActive    PlanStatus = "active"
	PlanBlocked   PlanStatus = "blocked"
	PlanCompleted PlanStatus = "completed"
)

// EventType is the set of accepted events.
type EventType string

const (
	EventTaskStart   EventType = "task.start"
	EventTaskComplete EventType = "task.complete"
	EventTaskBlock   EventType = "task.block"
	EventTaskUnblock EventType = "task.unblock"
	EventTaskNote    EventType = "task.note"
)

// Template is a static definition; Plan is a runtime instance.
type Template struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Stages      []Stage `json:"stages"`
}

// Stage groups Tasks in execution order.
type Stage struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Order int    `json:"order"`
	Tasks []Task `json:"tasks"`
}

// Task is the smallest unit the engine understands.
type Task struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Owner       string   `json:"owner"`
	Estimate    string   `json:"estimate"`
	DependsOn   []string `json:"dependsOn"`
}

// Plan is the runtime artifact produced from a Template.
type Plan struct {
	ID          string      `json:"id"`
	TemplateID  string      `json:"templateId"`
	WorkspaceID string      `json:"workspaceId"`
	Owner       string      `json:"owner"`
	CreatedAt   string      `json:"createdAt"`
	UpdatedAt   string      `json:"updatedAt"`
	Status      PlanStatus  `json:"status"`
	Stages      []PlanStage `json:"stages"`
}

// PlanStage tracks progress within a stage.
type PlanStage struct {
	ID     string     `json:"id"`
	Name   string     `json:"name"`
	Order  int        `json:"order"`
	Status StageStatus `json:"status"`
	Tasks  []PlanTask `json:"tasks"`
}

// PlanTask tracks progress within a single task.
type PlanTask struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Owner       string     `json:"owner"`
	Estimate    string     `json:"estimate"`
	Status      TaskStatus `json:"status"`
	StartedAt   string     `json:"startedAt"`
	CompletedAt string     `json:"completedAt"`
	Notes       []Note     `json:"notes"`
}

// Note is an annotation appended to a task.
type Note struct {
	At    string `json:"at"`
	Actor string `json:"actor"`
	Body  string `json:"body"`
}

// Event is what callers push into Apply.
type Event struct {
	Type   EventType
	TaskID string
	StageID string
	Note   string
	Actor  string
	Now    func() time.Time
}

// Errors returned by Render / Apply.
var (
	ErrTemplateNotFound = errors.New("pmsop: template not found")
	ErrPlanNotFound     = errors.New("pmsop: plan stage/task not found")
	ErrInvalidEvent     = errors.New("pmsop: event not applicable in current state")
)

// Engine is a goroutine-safe template registry + state machine.
type Engine struct {
	mu        sync.RWMutex
	templates map[string]Template
}

// New returns an Engine seeded with the bundled templates.
func New() *Engine {
	e := &Engine{templates: map[string]Template{}}
	for _, t := range DefaultTemplates() {
		e.templates[t.ID] = t
	}
	return e
}

// Register adds or replaces a template by ID.
func (e *Engine) Register(t Template) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.templates[t.ID] = t
}

// Template fetches a template by ID.
func (e *Engine) Template(id string) (Template, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	t, ok := e.templates[id]
	return t, ok
}

// Templates returns every registered template sorted by ID.
func (e *Engine) Templates() []Template {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]Template, 0, len(e.templates))
	for _, t := range e.templates {
		out = append(out, t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// Render materialises a Plan from a template. planID is the caller's
// pre-allocated ID; workspace + owner get stamped on every audit-able
// surface.
func (e *Engine) Render(templateID, planID, workspaceID, owner string, now func() time.Time) (Plan, error) {
	t, ok := e.Template(templateID)
	if !ok {
		return Plan{}, ErrTemplateNotFound
	}
	if now == nil {
		now = time.Now
	}
	stamp := now().UTC().Format(time.RFC3339)
	stages := make([]PlanStage, 0, len(t.Stages))
	for _, s := range t.Stages {
		tasks := make([]PlanTask, 0, len(s.Tasks))
		for _, tk := range s.Tasks {
			tasks = append(tasks, PlanTask{
				ID:          tk.ID,
				Title:       tk.Title,
				Description: tk.Description,
				Owner:       tk.Owner,
				Estimate:    tk.Estimate,
				Status:      TaskPending,
			})
		}
		stages = append(stages, PlanStage{
			ID:     s.ID,
			Name:   s.Name,
			Order:  s.Order,
			Status: stageInitialStatus(s.Tasks),
			Tasks:  tasks,
		})
	}
	return Plan{
		ID:          planID,
		TemplateID:  t.ID,
		WorkspaceID: workspaceID,
		Owner:       owner,
		CreatedAt:   stamp,
		UpdatedAt:   stamp,
		Status:      PlanDraft,
		Stages:      stages,
	}, nil
}

// stageInitialStatus is "active" if there is at least one task, else
// "pending". Templates with empty Stages get "pending" — Render should
// guard against this upstream, but we degrade gracefully.
func stageInitialStatus(tasks []Task) StageStatus {
	if len(tasks) == 0 {
		return StagePending
	}
	return StageActive
}

// Apply mutates a Plan in response to an Event and returns the updated
// copy. Pure: the input plan is not modified.
func (e *Engine) Apply(p Plan, ev Event) (Plan, error) {
	if ev.Now == nil {
		ev.Now = time.Now
	}
	stamp := ev.Now().UTC().Format(time.RFC3339)

	// Find the task (and its stage) once.
	taskIdx, stageIdx := locate(p, ev.StageID, ev.TaskID)
	if taskIdx < 0 || stageIdx < 0 {
		return p, fmt.Errorf("%w: stage=%s task=%s", ErrPlanNotFound, ev.StageID, ev.TaskID)
	}
	task := &p.Stages[stageIdx].Tasks[taskIdx]

	switch ev.Type {
	case EventTaskStart:
		if task.Status != TaskPending {
			return p, fmt.Errorf("%w: cannot start task in status %s", ErrInvalidEvent, task.Status)
		}
		task.Status = TaskInProgress
		if task.StartedAt == "" {
			task.StartedAt = stamp
		}
		p.Status = advancePlanStatus(p.Status, false)
		p.Stages[stageIdx].Status = advanceStageStatus(p.Stages[stageIdx])

	case EventTaskComplete:
		if task.Status == TaskDone {
			return p, ErrInvalidEvent
		}
		task.Status = TaskDone
		task.CompletedAt = stamp
		p.Stages[stageIdx].Status = advanceStageStatus(p.Stages[stageIdx])

	case EventTaskBlock:
		if task.Status == TaskDone {
			return p, fmt.Errorf("%w: cannot block a done task", ErrInvalidEvent)
		}
		task.Status = TaskBlocked
		p.Status = PlanBlocked

	case EventTaskUnblock:
		if task.Status != TaskBlocked {
			return p, fmt.Errorf("%w: task is not blocked (status=%s)", ErrInvalidEvent, task.Status)
		}
		task.Status = TaskPending

	case EventTaskNote:
		// Notes never change state.

	default:
		return p, fmt.Errorf("%w: unknown event type %q", ErrInvalidEvent, ev.Type)
	}

	if ev.Note != "" {
		task.Notes = append(task.Notes, Note{At: stamp, Actor: ev.Actor, Body: ev.Note})
	}
	p.UpdatedAt = stamp

	if allStagesCompleted(p) {
		p.Status = PlanCompleted
	} else if p.Status == PlanBlocked {
		// keep blocked until explicit unblock
	} else if anyTaskInProgress(p) {
		p.Status = PlanActive
	}
	return p, nil
}

// locate returns the (stage, task) indices matching the event's stage
// and task IDs. StageID may be empty, in which case the first stage
// containing TaskID wins. Returns (-1, -1) if not found.
func locate(p Plan, stageID, taskID string) (taskIdx, stageIdx int) {
	if stageID != "" {
		for si := range p.Stages {
			if p.Stages[si].ID != stageID {
				continue
			}
			for ti := range p.Stages[si].Tasks {
				if p.Stages[si].Tasks[ti].ID == taskID {
					return ti, si
				}
			}
			return -1, -1
		}
		return -1, -1
	}
	for si := range p.Stages {
		for ti := range p.Stages[si].Tasks {
			if p.Stages[si].Tasks[ti].ID == taskID {
				return ti, si
			}
		}
	}
	return -1, -1
}

func advanceStageStatus(s PlanStage) StageStatus {
	allDone := true
	for _, t := range s.Tasks {
		if t.Status != TaskDone {
			allDone = false
			break
		}
	}
	if allDone && len(s.Tasks) > 0 {
		return StageCompleted
	}
	any := false
	for _, t := range s.Tasks {
		if t.Status == TaskInProgress || t.Status == TaskDone {
			any = true
			break
		}
	}
	if any {
		return StageActive
	}
	return StagePending
}

func advancePlanStatus(curr PlanStatus, wasBlocked bool) PlanStatus {
	if wasBlocked {
		return PlanBlocked
	}
	return PlanActive
}

func allStagesCompleted(p Plan) bool {
	if len(p.Stages) == 0 {
		return false
	}
	for _, s := range p.Stages {
		if s.Status != StageCompleted {
			return false
		}
	}
	return true
}

func anyTaskInProgress(p Plan) bool {
	for _, s := range p.Stages {
		for _, t := range s.Tasks {
			if t.Status == TaskInProgress {
				return true
			}
		}
	}
	return false
}

// DefaultTemplates returns the bundled templates. Two are provided:
// agile-sprint (discovery → build → demo) and launch-checklist
// (pre-launch → launch → post-launch).
func DefaultTemplates() []Template {
	return []Template{
		agileSprintTemplate(),
		launchChecklistTemplate(),
	}
}

func agileSprintTemplate() Template {
	return Template{
		ID:          "agile-sprint",
		Name:        "敏捷 Sprint",
		Description: "2 周 sprint：discovery / build / demo 三个阶段",
		Stages: []Stage{
			{
				ID: "discovery", Name: "需求 Discovery", Order: 1,
				Tasks: []Task{
					{ID: "ds-1", Title: "用户访谈 ≥ 3 人", Estimate: "1d"},
					{ID: "ds-2", Title: "竞品分析", Estimate: "0.5d"},
					{ID: "ds-3", Title: "需求文档 v0.1", Estimate: "1d"},
				},
			},
			{
				ID: "build", Name: "开发", Order: 2,
				Tasks: []Task{
					{ID: "bd-1", Title: "技术方案评审", Estimate: "1d", DependsOn: []string{"ds-3"}},
					{ID: "bd-2", Title: "后端 API 实现", Estimate: "3d"},
					{ID: "bd-3", Title: "前端联调", Estimate: "3d"},
					{ID: "bd-4", Title: "自动化测试 ≥ 70% 覆盖", Estimate: "2d"},
				},
			},
			{
				ID: "demo", Name: "演示 & 复盘", Order: 3,
				Tasks: []Task{
					{ID: "dm-1", Title: "内部演示", Estimate: "0.5d"},
					{ID: "dm-2", Title: "复盘报告", Estimate: "0.5d"},
				},
			},
		},
	}
}

func launchChecklistTemplate() Template {
	return Template{
		ID:          "launch-checklist",
		Name:        "发布 Checklist",
		Description: "上线前后三阶段：pre-launch / launch / post-launch",
		Stages: []Stage{
			{
				ID: "pre", Name: "Pre-launch", Order: 1,
				Tasks: []Task{
					{ID: "pr-1", Title: "灰度 10%", Estimate: "1d"},
					{ID: "pr-2", Title: "监控告警就绪", Estimate: "0.5d"},
					{ID: "pr-3", Title: "回滚演练", Estimate: "0.5d"},
				},
			},
			{
				ID: "launch", Name: "Launch", Order: 2,
				Tasks: []Task{
					{ID: "lh-1", Title: "全量发布", Estimate: "0.5d"},
					{ID: "lh-2", Title: "公告 / 通知", Estimate: "0.5d"},
				},
			},
			{
				ID: "post", Name: "Post-launch", Order: 3,
				Tasks: []Task{
					{ID: "po-1", Title: "72h 监控报告", Estimate: "1d"},
					{ID: "po-2", Title: "用户反馈分桶", Estimate: "1d"},
				},
			},
		},
	}
}