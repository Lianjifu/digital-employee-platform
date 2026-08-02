package response

import (
	"encoding/json"
	"net/http"

	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

// API envelope matching frontend ApiClient expectations.
type Envelope struct {
	OK    bool        `json:"ok"`
	Data  any         `json:"data,omitempty"`
	Error *ErrorBody  `json:"error,omitempty"`
}

type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func OK(w http.ResponseWriter, data any) {
	JSON(w, http.StatusOK, Envelope{OK: true, Data: data})
}

func Created(w http.ResponseWriter, data any) {
	JSON(w, http.StatusCreated, Envelope{OK: true, Data: data})
}

func Fail(w http.ResponseWriter, err error) {
	if ae, ok := err.(*apperr.AppError); ok {
		JSON(w, ae.Status, Envelope{OK: false, Error: &ErrorBody{Code: string(ae.Code), Message: ae.Message}})
		return
	}
	JSON(w, http.StatusInternalServerError, Envelope{OK: false, Error: &ErrorBody{Code: string(apperr.Unknown), Message: err.Error()}})
}

func Decode(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.UseNumber()
	return dec.Decode(dst)
}
