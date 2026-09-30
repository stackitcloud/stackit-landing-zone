package main

import (
	"encoding/json"
	"os/exec"
	"reflect"
	"testing"
)

// Use the compiled production common model, not a fixture that bypasses it.
// Build packages first (npm run build:packages), as the validation workflow does.
func TestCommonModelNativeRoundTrip(t *testing.T) {
	cmd := exec.Command("node", "--input-type=module", "-e", `
import { catalogue, createCommonConfiguration, exportCommonTfvars } from './packages/domain/dist/index.js';
process.stdout.write(JSON.stringify(catalogue.templates.map(template => ({
  id: template.id, expected: template.values,
  hcl: exportCommonTfvars(createCommonConfiguration(template.id, '11111111-2222-4333-8444-555555555555'))
}))));`)
	cmd.Dir = "../../app"
	output, err := cmd.Output()
	if err != nil {
		t.Fatalf("common model failed (build domain packages first): %v", err)
	}
	var fixtures []struct {
		ID       string `json:"id"`
		Expected any    `json:"expected"`
		HCL      string `json:"hcl"`
	}
	if err := json.Unmarshal(output, &fixtures); err != nil {
		t.Fatal(err)
	}
	if len(fixtures) != 8 {
		t.Fatalf("expected eight reference templates, got %d", len(fixtures))
	}
	for _, fixture := range fixtures {
		t.Run(fixture.ID, func(t *testing.T) {
			parsed, err := parse([]byte(fixture.HCL), "common.tfvars")
			if err != nil {
				t.Fatal(err)
			}
			encoded, _ := json.Marshal(parsed)
			var actual any
			if err := json.Unmarshal(encoded, &actual); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(fixture.Expected, actual) {
				t.Fatal("common model HCL export changed values")
			}
		})
	}
}
