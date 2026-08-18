package infra

import "testing"

func TestFlattenAndGroupMessageBuckets(t *testing.T) {
	buckets := []map[string]any{
		{
			"id": "conv-a", "workspaceId": "w1",
			"messages": []map[string]any{
				{"id": "m1", "role": "user", "content": "hi"},
				{"id": "m2", "role": "assistant", "content": "yo"},
			},
		},
	}
	rows := FlattenMessageBuckets(buckets)
	if len(rows) != 2 {
		t.Fatalf("rows %d", len(rows))
	}
	if str(rows[0]["conversationId"]) != "conv-a" {
		t.Fatalf("cid %#v", rows[0])
	}
	grouped := GroupMessageBuckets(rows)
	if len(grouped) != 1 {
		t.Fatalf("grouped %d", len(grouped))
	}
	msgs, _ := grouped[0]["messages"].([]map[string]any)
	if len(msgs) != 2 || str(msgs[1]["content"]) != "yo" {
		t.Fatalf("messages %#v", grouped[0]["messages"])
	}
}

func TestKernelOwns(t *testing.T) {
	k := &KernelStore{}
	if !k.Owns("sessions") || !k.Owns("channel_inbound") || k.Owns("skills") {
		t.Fatal("kernel ownership mismatch")
	}
}
