package server_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"connectrpc.com/connect"
	collabv1 "github.com/digital-employee-platform/backend/gen/de/collab/v1"
	"github.com/digital-employee-platform/backend/gen/de/collab/v1/collabv1connect"
	ragv1 "github.com/digital-employee-platform/backend/gen/de/rag/v1"
	"github.com/digital-employee-platform/backend/gen/de/rag/v1/ragv1connect"
	"github.com/digital-employee-platform/backend/internal/server"
	"github.com/digital-employee-platform/backend/internal/store"
)

func TestConnectRPCRagRetrieve(t *testing.T) {
	h := server.New(store.New()).Handler()
	client := ragv1connect.NewRagServiceClient(&http.Client{Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		req.Header.Set("Authorization", "Bearer mock-admin-token")
		req.Header.Set("x-workspace-id", "w1")
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		return rr.Result(), nil
	})}, "http://test")

	res, err := client.Retrieve(context.Background(), connect.NewRequest(&ragv1.RetrieveRequest{
		Query: "缓存", CorrelationId: "corr-rpc-1", PublishedOnly: true,
	}))
	if err != nil {
		t.Fatal(err)
	}
	if res.Msg.GetCorrelationId() != "corr-rpc-1" {
		t.Fatalf("corr %s", res.Msg.GetCorrelationId())
	}
}

func TestConnectRPCCreateConversation(t *testing.T) {
	h := server.New(store.New()).Handler()
	client := collabv1connect.NewCollabServiceClient(&http.Client{Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		req.Header.Set("Authorization", "Bearer mock-admin-token")
		req.Header.Set("x-workspace-id", "w1")
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		return rr.Result(), nil
	})}, "http://test")

	res, err := client.CreateConversation(context.Background(), connect.NewRequest(&collabv1.CreateConversationRequest{
		Title: "RPC 会话", DigitalEmployeeId: "de-1",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if res.Msg.GetId() == "" || res.Msg.GetTitle() != "RPC 会话" {
		t.Fatalf("got %#v", res.Msg)
	}
}

func TestConnectJSONGatewayStillWorks(t *testing.T) {
	h := server.New(store.New()).Handler()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/connect/de.runtime.v1.RuntimeService/Invoke",
		bytes.NewBufferString(`{"input":"hi"}`))
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("%d %s", rr.Code, rr.Body.String())
	}
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
