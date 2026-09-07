package server_test

import "encoding/json"

// decodeJSONManifest / encodeJSONManifest are tiny shims so the signer test
// can round-trip the pack manifest without pulling in another package's
// struct types (we want to corrupt it via map mutation).

func decodeJSONManifest(b []byte, out any) error {
	return json.Unmarshal(b, out)
}

func encodeJSONManifest(in any) ([]byte, error) {
	return json.MarshalIndent(in, "", "  ")
}