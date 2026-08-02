package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/digital-employee-platform/backend/internal/deworkflow"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"
)

func main() {
	host := env("DE_TEMPORAL_HOST", "127.0.0.1:7233")
	c, err := client.Dial(client.Options{HostPort: host})
	if err != nil {
		log.Fatalf("temporal dial: %v", err)
	}
	defer c.Close()

	w := worker.New(c, "de-workflow", worker.Options{})
	w.RegisterWorkflowWithOptions(TrialRunWorkflow, workflow.RegisterOptions{Name: deworkflow.TrialWorkflowName})
	w.RegisterActivity(SimulateTrialActivity)

	log.Printf("de-workflow listening on %s queue=de-workflow", host)
	if err := w.Run(worker.InterruptCh()); err != nil {
		log.Fatal(err)
	}
}

func TrialRunWorkflow(ctx workflow.Context, in deworkflow.TrialInput) (deworkflow.TrialResult, error) {
	ao := workflow.ActivityOptions{StartToCloseTimeout: 30 * time.Second}
	ctx = workflow.WithActivityOptions(ctx, ao)
	var steps []string
	if err := workflow.ExecuteActivity(ctx, SimulateTrialActivity, in).Get(ctx, &steps); err != nil {
		return deworkflow.TrialResult{Status: "failed", Error: err.Error(), Steps: steps}, nil
	}
	return deworkflow.TrialResult{Status: "succeeded", Steps: steps}, nil
}

func SimulateTrialActivity(ctx context.Context, in deworkflow.TrialInput) ([]string, error) {
	steps := []string{"validate_graph", "allocate_worker"}
	steps = append(steps, deworkflow.CallTrialActivities(ctx, in.WorkflowID)...)
	steps = append(steps, "collect_artifacts", "temporal_activity")
	return steps, nil
}

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
